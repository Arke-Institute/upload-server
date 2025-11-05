/**
 * Upload API routes
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { sessionManager } from '../services/upload-session.js';
import { Uploader } from '../../lib/uploader.js';
import type {
  InitUploadRequest,
  ProcessUploadRequest,
} from '../../types/server.js';
import { getLogger } from '../../utils/logger.js';

const router = Router();
const logger = getLogger();

/**
 * Configure Multer for file uploads
 * Preserves directory structure from webkitRelativePath
 */
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const sessionId = req.params.sessionId || req.body.sessionId;
    const session = sessionManager.getSession(sessionId);

    if (!session) {
      return cb(new Error('Invalid session ID'), '');
    }

    // Extract directory path from webkitRelativePath
    // Format: "folder/subfolder/file.txt" -> preserve "folder/subfolder"
    const relativePath = (file as any).originalname || file.originalname;
    const fileDir = path.dirname(relativePath);
    const fullDir = path.join(session.uploadDir, fileDir);

    // Create directory if it doesn't exist
    try {
      await fs.mkdir(fullDir, { recursive: true });
      cb(null, fullDir);
    } catch (error: any) {
      cb(error, '');
    }
  },
  filename: (req, file, cb) => {
    // Use the original filename (basename)
    cb(null, path.basename(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 * 1024, // 5 GB
  },
});

/**
 * POST /api/v1/upload/init
 * Initialize a new upload session
 */
router.post('/init', async (req: Request, res: Response) => {
  try {
    const request: InitUploadRequest = req.body;

    // Validate required fields
    if (!request.uploader) {
      return res.status(400).json({ error: 'uploader is required' });
    }

    const session = await sessionManager.createSession(request);

    const baseUrl = `${req.protocol}://${req.get('host')}`;

    res.json({
      sessionId: session.sessionId,
      uploadUrl: `${baseUrl}/api/v1/upload/${session.sessionId}/files`,
      statusUrl: `${baseUrl}/api/v1/upload/${session.sessionId}/status`,
      expiresAt: session.expiresAt.toISOString(),
    });

    logger.info(`Session initialized: ${session.sessionId}`);
  } catch (error: any) {
    logger.error('Failed to initialize session', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/v1/upload/:sessionId/files
 * Upload files to session
 */
router.post(
  '/:sessionId/files',
  upload.array('files'),
  async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const session = sessionManager.getSession(sessionId);

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      if (session.status === 'processing' || session.status === 'completed') {
        return res
          .status(409)
          .json({ error: 'Cannot upload files to session in this state' });
      }

      const files = req.files as Express.Multer.File[];
      const filesReceived = files.length;
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);

      // Update session
      sessionManager.updateSession(sessionId, {
        filesReceived: session.filesReceived + filesReceived,
        totalSize: session.totalSize + totalSize,
        status: 'receiving',
      });

      logger.info(`Received ${filesReceived} files for session ${sessionId}`, {
        totalSize,
      });

      res.json({
        sessionId,
        filesReceived: session.filesReceived + filesReceived,
        totalSize: session.totalSize + totalSize,
        status: 'receiving',
      });
    } catch (error: any) {
      logger.error('File upload failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * POST /api/v1/upload/:sessionId/process
 * Trigger processing of uploaded files
 */
router.post('/:sessionId/process', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { dryRun } = req.body as ProcessUploadRequest;

    const session = sessionManager.getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.status === 'processing') {
      return res.status(409).json({ error: 'Session already processing' });
    }

    if (session.status === 'completed') {
      return res.status(409).json({ error: 'Session already completed' });
    }

    // Update status to processing
    sessionManager.updateStatus(sessionId, 'processing');

    // Start processing asynchronously
    processUploadSession(sessionId, dryRun || false).catch((error) => {
      logger.error(`Processing failed for session ${sessionId}`, {
        error: error.message,
      });
      sessionManager.updateStatus(sessionId, 'failed');
      sessionManager.addError(sessionId, error.message);
    });

    logger.info(`Processing started for session ${sessionId}`, { dryRun });

    res.json({
      sessionId,
      status: 'processing',
      message: 'Processing started. Poll status endpoint for progress updates.',
    });
  } catch (error: any) {
    logger.error('Failed to start processing', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * Process upload session (runs in background)
 * This uses the existing Uploader class from lib/
 */
async function processUploadSession(
  sessionId: string,
  dryRun: boolean
): Promise<void> {
  const session = sessionManager.getSession(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  // Create progress callback to update session
  const progressCallback = (progress: any) => {
    const percentComplete =
      progress.totalBytes && progress.bytesUploaded
        ? Math.round((progress.bytesUploaded / progress.totalBytes) * 100)
        : 0;

    sessionManager.updateProgress(sessionId, {
      phase: progress.phase,
      filesTotal: progress.filesTotal || 0,
      filesProcessed: progress.filesProcessed || 0,
      filesUploaded: progress.filesCompleted || 0,
      filesFailed: progress.filesFailed || 0,
      bytesTotal: progress.totalBytes || 0,
      bytesProcessed: progress.bytesUploaded || 0,
      bytesUploaded: progress.bytesUploaded || 0,
      percentComplete,
      currentFile: progress.currentFile,
    });

    logger.debug(`Progress update for ${sessionId}`, {
      phase: progress.phase,
      percent: percentComplete,
    });
  };

  // Create Uploader instance with session config and progress callback
  const uploader = new Uploader(
    {
      ...session.config,
      dryRun,
    },
    progressCallback
  );

  try {
    // Run the upload workflow
    // This calls the existing logic: scan, preprocess, upload, finalize
    await uploader.upload();

    // Mark as completed
    sessionManager.updateStatus(sessionId, 'completed');
    logger.info(`Session completed: ${sessionId}`);

    // Schedule cleanup after 5 minutes
    setTimeout(async () => {
      await sessionManager.deleteSession(sessionId);
      logger.info(`Session cleaned up: ${sessionId}`);
    }, 5 * 60 * 1000);
  } catch (error: any) {
    logger.error(`Session failed: ${sessionId}`, { error: error.message });
    sessionManager.updateStatus(sessionId, 'failed');
    sessionManager.addError(sessionId, error.message);
    throw error;
  }
}

/**
 * GET /api/v1/upload/:sessionId/status
 * Get session status and progress
 */
router.get('/:sessionId/status', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const session = sessionManager.getSession(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json({
    sessionId: session.sessionId,
    status: session.status,
    phase: session.progress?.phase,
    progress: session.progress,
    errors: session.errors,
    startedAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  });
});

/**
 * DELETE /api/v1/upload/:sessionId
 * Cancel and delete session
 */
router.delete('/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = sessionManager.getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Update status to cancelled if still in progress
    if (session.status === 'processing') {
      sessionManager.updateStatus(sessionId, 'cancelled');
    }

    // Delete session and cleanup files
    await sessionManager.deleteSession(sessionId);

    logger.info(`Session cancelled: ${sessionId}`);

    res.json({
      sessionId,
      status: 'cancelled',
      message: 'Upload cancelled and temp files cleaned up',
    });
  } catch (error: any) {
    logger.error('Failed to cancel session', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

export default router;
