/**
 * Arke Upload Server
 * Main entry point for the upload gateway API
 */

import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import uploadRoutes from './routes/upload.js';
import healthRoutes from './routes/health.js';
import { sessionManager } from './services/upload-session.js';
import { getLogger, initLogger } from '../utils/logger.js';

// Load environment variables
dotenv.config();

// Initialize logger
const debug = process.env.DEBUG === 'true';
initLogger(debug);
const logger = getLogger();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create Express app
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log all requests (if debug mode)
if (debug) {
  app.use((req: Request, res: Response, next: NextFunction) => {
    logger.debug(`${req.method} ${req.url}`, {
      body: req.body,
      query: req.query,
    });
    next();
  });
}

// Mount routes
app.use('/api/v1/upload', uploadRoutes);
app.use('/api/v1/health', healthRoutes);

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'Arke Upload Server',
    version: '2.0.0',
    description: 'Upload gateway server for Arke Institute ingest service',
    endpoints: {
      health: '/api/v1/health',
      upload: {
        init: 'POST /api/v1/upload/init',
        files: 'POST /api/v1/upload/:sessionId/files',
        process: 'POST /api/v1/upload/:sessionId/process',
        status: 'GET /api/v1/upload/:sessionId/status',
        cancel: 'DELETE /api/v1/upload/:sessionId',
      },
    },
    docs: 'https://github.com/Arke-Institute/upload-server',
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.url}`,
  });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
  });

  res.status(500).json({
    error: 'Internal Server Error',
    message: debug ? err.message : 'An error occurred',
  });
});

// Start server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  logger.info(`Arke Upload Server listening on port ${PORT}`, {
    env: process.env.NODE_ENV || 'development',
    workerUrl: process.env.WORKER_URL || 'https://ingest.arke.institute',
    uploadDir: process.env.UPLOAD_DIR || '/tmp/arke-uploads',
  });
});

// Graceful shutdown
const shutdown = async (signal: string) => {
  logger.info(`Received ${signal}, starting graceful shutdown`);

  // Stop accepting new connections
  server.close(() => {
    logger.info('HTTP server closed');
  });

  // Clean up all sessions
  try {
    await sessionManager.cleanupAll();
    logger.info('All sessions cleaned up');
  } catch (error: any) {
    logger.error('Error during session cleanup', { error: error.message });
  }

  // Exit
  process.exit(0);
};

// Handle shutdown signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
  logger.error('Unhandled rejection', {
    reason: reason?.message || reason,
  });
  process.exit(1);
});

export default app;
