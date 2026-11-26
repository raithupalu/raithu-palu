import { Request, Response, NextFunction, CookieOptions } from 'express';
import { AppError } from '../middleware/notFound';
import { AUTH_COOKIE_NAME } from '../middleware/authMiddleware';
import { authService } from '../services/authService';
import { env } from '../config/env';

function isSecureRequest(req: Request): boolean {
  if (env.NODE_ENV === 'production') {
    return true;
  }
  if (req.secure) {
    return true;
  }
  const forwardedProto = req.headers['x-forwarded-proto'];
  if (typeof forwardedProto === 'string') {
    return forwardedProto.split(',')[0].trim().toLowerCase() === 'https';
  }
  return false;
}

function buildCookieOptions(req: Request): CookieOptions {
  const secure = isSecureRequest(req);
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  };
}

export const authController = {
  async registerCustomer(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;

      if (body.role !== undefined && body.role !== 'CUSTOMER') {
        throw new AppError(
          403,
          'FORBIDDEN_ROLE_ASSIGNMENT',
          'Public registration is permitted only for Customer accounts.'
        );
      }

      const session = await authService.registerCustomer({
        fullName: body.fullName,
        mobileNumber: body.mobileNumber,
        password: body.password,
        address: body.address,
      });

      res.cookie(
        AUTH_COOKIE_NAME,
        session.accessToken,
        buildCookieOptions(req)
      );

      res.status(201).json({
        status: 'ok',
        message: 'Customer account registered successfully.',
        accessToken: session.accessToken,
        user: session.user,
        data: session,
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
      const body = (req.body ?? {}) as Record<string, unknown>;

      const session = await authService.loginCustomer({
        mobileNumber: body.mobileNumber,
        password: body.password,
      });

      res.cookie(
        AUTH_COOKIE_NAME,
        session.accessToken,
        buildCookieOptions(req)
      );

      res.status(200).json({
        status: 'ok',
        message: 'Customer logged in successfully.',
        accessToken: session.accessToken,
        user: session.user,
        data: session,
      });
    } catch (err) {
      next(err);
    }
  },

  async loginAdmin(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;

      const session = await authService.loginAdmin({
        mobileNumber: body.mobileNumber,
        password: body.password,
      });

      res.cookie(
        AUTH_COOKIE_NAME,
        session.accessToken,
        buildCookieOptions(req)
      );

      res.status(200).json({
        status: 'ok',
        message: 'Admin logged in successfully.',
        accessToken: session.accessToken,
        user: session.user,
        data: session,
      });
    } catch (err) {
      next(err);
    }
  },

  async loginAnyRole(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;

      const session = await authService.loginAnyRole({
        mobileNumber: body.mobileNumber,
        password: body.password,
      });

      res.cookie(
        AUTH_COOKIE_NAME,
        session.accessToken,
        buildCookieOptions(req)
      );

      res.status(200).json({
        status: 'ok',
        message: 'Logged in successfully.',
        accessToken: session.accessToken,
        user: session.user,
        data: session,
      });
    } catch (err) {
      next(err);
    }
  },

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.authUser) {
        await authService.logoutSession(req.authUser.id, req.authTokenPayload);
      }

      const secure = isSecureRequest(req);
      res.clearCookie(AUTH_COOKIE_NAME, {
        httpOnly: true,
        secure,
        sameSite: secure ? 'none' : 'lax',
        path: '/',
      });

      res.status(200).json({
        status: 'ok',
        message: 'Logged out successfully.',
      });
    } catch (err) {
      next(err);
    }
  },

  async getSession(
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

      const profile = await authService.getAuthenticatedSessionProfile(
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

  async getCustomerProfile(
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

      const profile = await authService.getCustomerProfile(req.authUser.id);
      res.status(200).json({
        status: 'ok',
        data: {
          profile,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  async updateCustomerProfile(
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

      const body = (req.body ?? {}) as Record<string, unknown>;

      const forbiddenKeys = [
        'role',
        'status',
        'mobileNumber',
        'password',
        'passwordHash',
        'tokenVersion',
        'userCode',
        'staffPermissions',
        'farmerProfile',
        'grazingWorkerProfile',
      ];
      for (const key of forbiddenKeys) {
        if (key in body) {
          throw new AppError(
            400,
            'IMMUTABLE_PROFILE_FIELD',
            `Field "${key}" cannot be modified through the profile update endpoint.`
          );
        }
      }

      const updatedProfile = await authService.updateCustomerProfile(
        req.authUser.id,
        {
          fullName: body.fullName,
          address: body.address,
        }
      );

      res.status(200).json({
        status: 'ok',
        message: 'Customer profile updated successfully.',
        data: {
          profile: updatedProfile,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  async changePassword(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.authUser) throw new AppError(401,'AUTHENTICATION_REQUIRED','Authentication required');
      const body = (req.body ?? {}) as Record<string, unknown>;
      const updated = await authService.changePassword(req.authUser.id, {
        currentPassword: body.currentPassword,
        newPassword: body.newPassword,
      });
      res.status(200).json({ status:'ok', message:'Password changed successfully', data:{ user: updated } });
    } catch (err) { next(err); }
  },
};
