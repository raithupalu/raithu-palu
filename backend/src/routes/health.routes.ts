import { Router, Request, Response } from 'express';
import { getDatabaseHealth } from '../config/database';
import { env } from '../config/env';

const healthRouter = Router();

/**
 * GET /api/health
 * Reports application runtime status and MongoDB connectivity separately.
 * Never exposes credentials, connection strings, or internal topology details.
 */
healthRouter.get('/', (_req: Request, res: Response) => {
  const dbHealth = getDatabaseHealth();

  res.status(200).json({
    status: 'ok',
    service: 'raithu-palu-backend',
    phase: 'phase-1-step-1-customer-auth',
    timestamp: new Date().toISOString(),
    application: {
      status: 'up',
      environment: env.NODE_ENV,
      uptimeSeconds: Math.floor(process.uptime()),
    },
    database: {
      status: dbHealth.state,
      connected: dbHealth.connected,
      transactionsRequired: true,
    },
  });
});

export default healthRouter;
