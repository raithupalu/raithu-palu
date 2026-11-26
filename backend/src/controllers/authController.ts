import { Request, Response, NextFunction, CookieOptions } from 'express';
import { env } from '../config/env';
import { AUTH_COOKIE_NAME } from '../middleware/authMiddleware';
import { AppError } from '../middleware/notFound';
import { authService } from '../services/authService';

function isHttpsRequest(req: Request): boolean {
  if (req.secure || env.NODE_ENV === 'production') {
    return true;
  }
  const forwardedProto = req.headers['x-forwarded-proto'];
  if (typeof forwardedProto === 'string') {
    return forwardedProto
      .split(',')
      .map((p) => p.trim().toLowerCase())
      .includes('https');
  }
  if (Array.isArray(forwardedProto)) {
    return forwardedProto.some((p) => p.toLowerCase().includes('https'));
  }
  return false;
}

function buildCookieOptions(req: Request): CookieOptions {
  const https = isHttpsRequest(req);
  return {
    httpOnly: true,
    sameSite: https ? 'none' : 'lax',
    secure: https,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    ...(https ? ({ partitioned: true } as Partial<CookieOptions>) : {}),
  };
}

function setAuthCookie(req: Request, res: Response, token: string): void {
  res.cookie(AUTH_COOKIE_NAME, token, buildCookieOptions(req));
}

function clearAuthCookie(req: Request, res: Response): void {
  const https = isHttpsRequest(req);
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: https ? 'none' : 'lax',
    secure: https,
    path: '/',
  });
}

export const authController = {
  async registerCustomer(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const body =
        req.body && typeof req.body === 'object'
          ? (req.body as Record<string, unknown>)
          : {};

      const session = await authService.registerCustomer(body);
      setAuthCookie(req, res, session.accessToken);

      res.status(201).json({
        status: 'ok',
        message: 'Customer account registered successfully.',
        user: session.user,
        accessToken: session.accessToken,
        expiresIn: session.expiresIn,
        data: {
          user: session.user,
          accessToken: session.accessToken,
          expiresIn: session.expiresIn,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  async loginCustomer(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const body =
        req.body && typeof req.body === 'object'
          ? (req.body as Record<string, unknown>)
          : {};

      const session = await authService.loginCustomer(body);
      setAuthCookie(req, res, session.accessToken);

      res.status(200).json({
        status: 'ok',
        message: 'Customer logged in successfully.',
        user: session.user,
        accessToken: session.accessToken,
        expiresIn: session.expiresIn,
        data: {
          user: session.user,
          accessToken: session.accessToken,
          expiresIn: session.expiresIn,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  async logout(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.authTokenPayload) {
        throw new AppError(
          401,
          'AUTHENTICATION_REQUIRED',
          'Authentication is required to log out.'
        );
      }

      await authService.logoutSession(req.authTokenPayload);
      clearAuthCookie(req, res);

      res.status(200).json({
        status: 'ok',
        message: 'Logged out successfully.',
      });
    } catch (err) {
      next(err);
    }
  },

  async getCurrentSession(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.authUser) {
        throw new AppError(
          401,
          'AUTHENTICATION_REQUIRED',
          'Authentication is required.'
        );
      }

      const profile = await authService.getAuthenticatedCustomerProfile(
        req.authUser.id
      );

      res.status(200).json({
        status: 'ok',
        user: profile,
        data: {
          user: profile,
          profile,
        },
      });
    } catch (err) {
      next(err);
    }
  },
};
