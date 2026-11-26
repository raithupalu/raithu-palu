import express, { Application } from 'express';
import cors, { CorsOptions } from 'cors';
import helmet from 'helmet';
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

  // 404 Not Found and Centralized Error Handling
  app.use(notFoundMiddleware);
  app.use(errorHandlerMiddleware);

  return app;
}

export const app = createApp();
