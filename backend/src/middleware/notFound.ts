import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function notFoundMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  next(
    new AppError(
      404,
      'RESOURCE_NOT_FOUND',
      `Route not found: ${req.method} ${req.originalUrl}`
    )
  );
}
