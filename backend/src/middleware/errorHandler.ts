import { Request, Response, NextFunction } from 'express';
import { AppError } from './notFound';
import { env } from '../config/env';

interface BodyParserSyntaxError extends SyntaxError {
  status?: number;
  type?: string;
}

export function errorHandlerMiddleware(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    const details = (err as unknown as Record<string, unknown>).details ?? (err as unknown as Record<string, unknown>).errors ? { errors: (err as unknown as Record<string, unknown>).errors, details: (err as unknown as Record<string, unknown>).details } : undefined;
    res.status(err.statusCode).json({
      status: 'error',
      code: err.code,
      message: err.message,
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
      ...(details ? { errors: (err as unknown as Record<string, unknown>).errors, details: (err as unknown as Record<string, unknown>).details } : {}),
    });
    return;
  }

  const bodyErr = err as BodyParserSyntaxError;
  if (bodyErr.type === 'entity.too.large' || bodyErr.status === 413) {
    res.status(413).json({
      status: 'error',
      code: 'PAYLOAD_TOO_LARGE',
      message: `Request body exceeds maximum allowed size (${env.JSON_BODY_LIMIT}).`,
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (bodyErr instanceof SyntaxError && bodyErr.status === 400) {
    res.status(400).json({
      status: 'error',
      code: 'INVALID_JSON',
      message: 'Malformed JSON in request body.',
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  console.error('[Error] Unhandled request error:', err.message);

  res.status(500).json({
    status: 'error',
    code: 'INTERNAL_SERVER_ERROR',
    message:
      env.NODE_ENV === 'production'
        ? 'An unexpected internal error occurred.'
        : err.message || 'An unexpected internal error occurred.',
    path: req.originalUrl,
    timestamp: new Date().toISOString(),
  });
}
