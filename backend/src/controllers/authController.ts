import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { AUTH_COOKIE_NAME } from '../middleware/authMiddleware';
import { AppError } from '../middleware/notFound';
import { authService } from '../services/authService';

function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
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
      setAuthCookie(res, session.accessToken);

      res.status(201).json({
        status: 'ok',
        message: 'Customer account registered successfully.',
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
      setAuthCookie(res, session.accessToken);

      res.status(200).json({
        status: 'ok',
        message: 'Customer logged in successfully.',
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
      clearAuthCookie(res);

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
        data: {
          user: profile,
        },
      });
    } catch (err) {
      next(err);
    }
  },
};
