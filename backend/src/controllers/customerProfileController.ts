import { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/notFound';
import { authService } from '../services/authService';
import { customerSelfService } from '../services/customerSelfService';

export const customerProfileController = {
  async getProfile(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.authUser) {
        throw new AppError(
          401,
          'AUTHENTICATION_REQUIRED',
          'Authentication is required to view customer profile.'
        );
      }

      const profile = await authService.getAuthenticatedCustomerProfile(
        req.authUser.id
      );

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

  async updateProfile(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.authUser) {
        throw new AppError(
          401,
          'AUTHENTICATION_REQUIRED',
          'Authentication is required to update customer profile.'
        );
      }

      const body =
        req.body && typeof req.body === 'object'
          ? (req.body as Record<string, unknown>)
          : {};

      const updatedProfile = await authService.updateAuthenticatedCustomerProfile(
        req.authUser.id,
        body
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

  async addAddress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.authUser) throw new AppError(401,'AUTHENTICATION_REQUIRED','Authentication required');
      const body = (req.body ?? {}) as Record<string, unknown>;
      const profile = await customerSelfService.addAddress(req.authUser.id, body);
      res.status(201).json({ status:'ok', data:{ profile } });
    } catch (err) { next(err); }
  },
  async updateAddress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.authUser) throw new AppError(401,'AUTHENTICATION_REQUIRED','Authentication required');
      const body = (req.body ?? {}) as Record<string, unknown>;
      const profile = await customerSelfService.updateAddress(req.authUser.id, String(req.params.addressId ?? ''), body);
      res.status(200).json({ status:'ok', data:{ profile } });
    } catch (err) { next(err); }
  },
  async activateAddress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.authUser) throw new AppError(401,'AUTHENTICATION_REQUIRED','Authentication required');
      const profile = await customerSelfService.activateAddress(req.authUser.id, String(req.params.addressId ?? ''));
      res.status(200).json({ status:'ok', data:{ profile } });
    } catch (err) { next(err); }
  },
  async archiveAddress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.authUser) throw new AppError(401,'AUTHENTICATION_REQUIRED','Authentication required');
      const profile = await customerSelfService.archiveAddress(req.authUser.id, String(req.params.addressId ?? ''));
      res.status(200).json({ status:'ok', data:{ profile } });
    } catch (err) { next(err); }
  },
};
