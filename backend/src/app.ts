import express, { Application, Request, Response, NextFunction } from 'express';
import cors, { CorsOptions } from 'cors';
import helmet from 'helmet';
import fs from 'fs';
import path from 'path';
import { env } from './config/env';
import healthRouter from './routes/health.routes';
import { notFoundMiddleware, AppError } from './middleware/notFound';
import { errorHandlerMiddleware } from './middleware/errorHandler';

function buildCorsOptions(): CorsOptions {
  const configuredOrigins = env.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    origin: (requestOrigin, callback) => {
      // Allow non-browser requests (e.g. curl, health checks) with no Origin header
      if (!requestOrigin) {
        callback(null, true);
        return;
      }

      if (
        configuredOrigins.includes('*') ||
        configuredOrigins.includes(requestOrigin)
      ) {
        callback(null, true);
        return;
      }

      callback(
        new AppError(
          403,
          'CORS_ORIGIN_FORBIDDEN',
          `Origin "${requestOrigin}" is not permitted by CORS configuration.`
        )
      );
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    credentials: true,
  };
}

export function createApp(): Application {
  const app = express();

  app.disable('x-powered-by');

  // Security headers via Helmet (frameguard disabled for live preview compatibility)
  app.use(
    helmet({
      frameguard: false,
      contentSecurityPolicy: false,
    })
  );

  // Environment-driven CORS configuration
  app.use(cors(buildCorsOptions()));

  // Reasonable request-size limits
  app.use(express.json({ limit: env.JSON_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: env.JSON_BODY_LIMIT }));

  // Phase 0 Foundation Routes
  app.use('/api/health', healthRouter);

  // All unmatched /api/* routes return structured 404 JSON
  app.use('/api', notFoundMiddleware);

  // Serve built frontend bundle on port 5000 when present for preview compatibility
  const frontendDistPath = path.resolve(__dirname, '../../frontend/dist');
  const frontendIndexHtml = path.join(frontendDistPath, 'index.html');

  if (fs.existsSync(frontendIndexHtml)) {
    app.use(express.static(frontendDistPath));
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/api')) {
        next();
        return;
      }
      res.sendFile(frontendIndexHtml);
    });
  }

  // 404 Not Found and Centralized Error Handling
  app.use(notFoundMiddleware);
  app.use(errorHandlerMiddleware);

  return app;
}

export const app = createApp();
