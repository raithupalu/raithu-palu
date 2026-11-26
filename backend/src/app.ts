import express, { Application, Request, Response, NextFunction } from 'express';
import cors, { CorsOptions } from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import fs from 'fs';
import path from 'path';
import { env } from './config/env';
import healthRouter from './routes/health.routes';
import authRouter from './routes/auth.routes';
import customerRouter from './routes/customer.routes';
import adminRouter from './routes/admin.routes';
import staffRouter from './routes/staff.routes';
import { notFoundMiddleware, AppError } from './middleware/notFound';
import { errorHandlerMiddleware } from './middleware/errorHandler';

function buildCorsOptions(): CorsOptions {
  const configuredOrigins = env.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    origin: (requestOrigin, callback) => {
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
  app.set('trust proxy', 1);

  app.use(
    helmet({
      frameguard: false,
      contentSecurityPolicy: false,
    })
  );

  app.use(cors(buildCorsOptions()));

  app.use(cookieParser());

  app.use(express.json({ limit: env.JSON_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: env.JSON_BODY_LIMIT }));

  // Phase 0 & Phase 1 Routes
  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/customer', customerRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/staff', staffRouter);

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
