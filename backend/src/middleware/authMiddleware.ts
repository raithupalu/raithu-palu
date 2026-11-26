import { Request, Response, NextFunction } from 'express';
import { AppError } from './notFound';
import {
  PublicUserProfile,
  toPublicUserProfile,
  UserRole,
} from '../models/User';
import {
  JwtAccessPayload,
  verifyAccessToken,
} from '../services/authService';
import { userRepository } from '../repositories/userRepository';

export const AUTH_COOKIE_NAME = 'rp_access_token';

declare global {
  namespace Express {
    interface Request {
      authUser?: PublicUserProfile;
      authTokenPayload?: JwtAccessPayload;
    }
  }
}

export function extractRequestToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token && token !== 'undefined' && token !== 'null') {
      return token;
    }
  }

  const cookieToken = (req as Request & { cookies?: Record<string, unknown> })
    .cookies?.[AUTH_COOKIE_NAME];
  if (typeof cookieToken === 'string' && cookieToken.trim()) {
    return cookieToken.trim();
  }

  return null;
}

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractRequestToken(req);
    if (!token) {
      throw new AppError(
        401,
        'AUTHENTICATION_REQUIRED',
        'Authentication is required to access this resource.'
      );
    }

    const payload = verifyAccessToken(token);
    const user = await userRepository.findById(payload.sub);

    if (!user) {
      throw new AppError(
        401,
        'INVALID_TOKEN_USER',
        'Authenticated account no longer exists.'
      );
    }

    if (user.status !== 'ACTIVE') {
      throw new AppError(
        403,
        'ACCOUNT_INACTIVE',
        `Your account status is ${user.status}. Access denied.`
      );
    }

    if ((user.tokenVersion ?? 0) !== (payload.tokenVersion ?? 0)) {
      throw new AppError(
        401,
        'TOKEN_REVOKED',
        'Authentication session has been invalidated. Please log in again.'
      );
    }

    req.authUser = toPublicUserProfile(user);
    req.authTokenPayload = payload;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      next(
        new AppError(
          401,
          'AUTHENTICATION_REQUIRED',
          'Authentication is required to access this resource.'
        )
      );
      return;
    }

    if (!allowedRoles.includes(req.authUser.role)) {
      next(
        new AppError(
          403,
          'FORBIDDEN_ROLE',
          `Access denied. Required role: ${allowedRoles.join(' or ')}.`
        )
      );
      return;
    }

    next();
  };
}
