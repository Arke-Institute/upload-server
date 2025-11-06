/**
 * Upload session manager
 * Handles session lifecycle, storage, and cleanup
 */

import { ulid } from 'ulid';
import path from 'path';
import fs from 'fs/promises';
import type {
  UploadSession,
  InitUploadRequest,
  SessionStatus,
  UploadProgress,
} from '../../types/server.js';
import type { UploadConfig } from '../../types/batch.js';
import { getLogger } from '../../utils/logger.js';

const logger = getLogger();

/**
 * In-memory session store
 * TODO: Move to Redis for multi-server deployments
 */
class SessionManager {
  private sessions = new Map<string, UploadSession>();
  private readonly UPLOAD_BASE_DIR =
    process.env.UPLOAD_DIR || '/tmp/arke-uploads';
  private readonly SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours
  private cleanupTimers = new Map<string, NodeJS.Timeout>();

  /**
   * Create a new upload session
   */
  async createSession(request: InitUploadRequest): Promise<UploadSession> {
    const sessionId = ulid();
    const uploadDir = path.join(this.UPLOAD_BASE_DIR, sessionId);

    // Create upload directory
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      logger.debug(`Created upload directory: ${uploadDir}`);
    } catch (error: any) {
      logger.error(`Failed to create upload directory: ${error.message}`);
      throw new Error(`Failed to create upload directory: ${error.message}`);
    }

    const config: UploadConfig = {
      directory: uploadDir,
      workerUrl: process.env.WORKER_URL || 'https://ingest.arke.institute',
      uploader: request.uploader,
      rootPath: request.rootPath || '/',
      parentPi: request.parentPi || '00000000000000000000000000',
      metadata: request.metadata,
      processing: request.processing,
      preprocessor: request.preprocessor,
      parallelUploads: request.parallelUploads || 5,
      parallelParts: request.parallelParts || 3,
      debug: false,
      dryRun: false,
      resume: false,
    };

    const session: UploadSession = {
      sessionId,
      config,
      status: 'initialized',
      uploadDir,
      filesReceived: 0,
      totalSize: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + this.SESSION_TTL),
      errors: [],
    };

    this.sessions.set(sessionId, session);
    logger.info(`Created session: ${sessionId}`, {
      uploader: request.uploader,
      rootPath: request.rootPath,
    });

    // Schedule auto-cleanup
    this.scheduleCleanup(sessionId);

    return session;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): UploadSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Update session with partial data
   */
  updateSession(sessionId: string, updates: Partial<UploadSession>): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      Object.assign(session, updates, { updatedAt: new Date() });
      logger.debug(`Updated session: ${sessionId}`, updates);
    }
  }

  /**
   * Update session status
   */
  updateStatus(sessionId: string, status: SessionStatus): void {
    this.updateSession(sessionId, { status });
  }

  /**
   * Update session progress
   */
  updateProgress(sessionId: string, progress: UploadProgress): void {
    this.updateSession(sessionId, { progress });
  }

  /**
   * Update batch ID after worker batch is created
   */
  updateBatchId(sessionId: string, batchId: string): void {
    this.updateSession(sessionId, { batchId });
    logger.info(`Session ${sessionId} linked to batch ${batchId}`);
  }

  /**
   * Add error to session
   */
  addError(sessionId: string, error: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.errors.push(error);
      session.updatedAt = new Date();
      logger.warn(`Session ${sessionId} error: ${error}`);
    }
  }

  /**
   * Delete session and cleanup files
   */
  async deleteSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    logger.info(`Deleting session: ${sessionId}`);

    // Cancel cleanup timer
    const timer = this.cleanupTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.cleanupTimers.delete(sessionId);
    }

    // Delete upload directory
    try {
      await fs.rm(session.uploadDir, { recursive: true, force: true });
      logger.debug(`Deleted upload directory: ${session.uploadDir}`);
    } catch (error: any) {
      logger.error(
        `Failed to delete upload dir ${session.uploadDir}: ${error.message}`
      );
    }

    // Remove from memory
    this.sessions.delete(sessionId);
  }

  /**
   * Schedule automatic cleanup after TTL
   */
  private scheduleCleanup(sessionId: string): void {
    const timer = setTimeout(async () => {
      const session = this.sessions.get(sessionId);
      if (session && Date.now() > session.expiresAt.getTime()) {
        logger.info(`Auto-cleaning expired session: ${sessionId}`);
        await this.deleteSession(sessionId);
      }
    }, this.SESSION_TTL);

    this.cleanupTimers.set(sessionId, timer);
  }

  /**
   * Clean up all sessions (on server shutdown)
   */
  async cleanupAll(): Promise<void> {
    logger.info(`Cleaning up all sessions (${this.sessions.size} total)`);

    const sessionIds = Array.from(this.sessions.keys());
    await Promise.all(sessionIds.map((id) => this.deleteSession(id)));

    logger.info('All sessions cleaned up');
  }

  /**
   * Get all active sessions (for debugging)
   */
  getAllSessions(): UploadSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get session count (for monitoring)
   */
  getSessionCount(): number {
    return this.sessions.size;
  }
}

// Export singleton instance
export const sessionManager = new SessionManager();
