/**
 * Health check endpoint
 */

import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import axios from 'axios';
import { sessionManager } from '../services/upload-session.js';
import type { HealthCheckResponse } from '../../types/server.js';
import { getLogger } from '../../utils/logger.js';

const router = Router();
const logger = getLogger();

// Track server start time
const startTime = Date.now();

/**
 * GET /api/v1/health
 * Server health check
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const workerUrl = process.env.WORKER_URL || 'https://ingest.arke.institute';
    const uploadDir = process.env.UPLOAD_DIR || '/tmp/arke-uploads';

    // Check disk space
    let diskAvailable = 0;
    let diskUsed = 0;
    try {
      const stats = await fs.statfs(uploadDir);
      diskAvailable = stats.bavail * stats.bsize;
      diskUsed = (stats.blocks - stats.bfree) * stats.bsize;
    } catch (error: any) {
      logger.warn('Failed to get disk stats', { error: error.message });
    }

    // Check worker connectivity
    let workerReachable = false;
    try {
      // Just check if we can reach the worker (without auth)
      // Try to hit the root or a known public endpoint
      const response = await axios.get(workerUrl, {
        timeout: 5000,
        validateStatus: () => true, // Accept any status
      });
      workerReachable = response.status < 500;
    } catch (error: any) {
      logger.warn('Worker health check failed', { error: error.message });
      workerReachable = false;
    }

    // Determine overall health status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (!workerReachable) {
      status = 'degraded';
    }
    if (diskAvailable < 1024 * 1024 * 1024) {
      // Less than 1 GB
      status = 'degraded';
    }
    if (diskAvailable < 100 * 1024 * 1024) {
      // Less than 100 MB
      status = 'unhealthy';
    }

    const health: HealthCheckResponse = {
      status,
      version: '2.0.0',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      storage: {
        tmpDirectory: uploadDir,
        available: diskAvailable,
        used: diskUsed,
      },
      worker: {
        url: workerUrl,
        reachable: workerReachable,
      },
    };

    // Add session count if in debug mode
    if (process.env.DEBUG === 'true') {
      (health as any).sessions = {
        active: sessionManager.getSessionCount(),
      };
    }

    // Return appropriate status code
    const httpStatus = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503;

    res.status(httpStatus).json(health);
  } catch (error: any) {
    logger.error('Health check failed', { error: error.message });
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
    });
  }
});

export default router;
