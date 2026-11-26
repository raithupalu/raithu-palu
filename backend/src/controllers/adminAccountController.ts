import { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/notFound';
import { adminAccountService } from '../services/adminAccountService';

export const adminAccountController = {
  async createAccount(
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
      const account = await adminAccountService.createManagedAccount(
        req.authUser,
        body
      );

      res.status(201).json({
        status: 'ok',
        message: `${account.role} account (${account.userCode}) created successfully.`,
        data: {
          account,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  async listAccounts(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const result = await adminAccountService.listAccounts({
        role: req.query.role,
        status: req.query.status,
        search: req.query.search,
      });

      res.status(200).json({
        status: 'ok',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  async getAccountDetails(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const result = await adminAccountService.getAccountDetails(
        String(req.params.id ?? '')
      );

      res.status(200).json({
        status: 'ok',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  async updateAccount(
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
      const account = await adminAccountService.updateAccount(
        req.authUser,
        String(req.params.id ?? ''),
        body
      );

      res.status(200).json({
        status: 'ok',
        message: `Account ${account.userCode} updated successfully.`,
        data: {
          account,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  async updateAccountStatus(
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
      const result = await adminAccountService.updateAccountStatus(
        req.authUser,
        String(req.params.id ?? ''),
        {
          status: body.status,
          reason: body.reason,
        }
      );

      res.status(200).json({
        status: 'ok',
        message: `Account ${result.account.userCode} status updated to ${result.account.status}.`,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  async updateStaffPermissions(
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
      const account = await adminAccountService.updateStaffPermissions(
        req.authUser,
        String(req.params.id ?? ''),
        body.staffPermissions
      );

      res.status(200).json({
        status: 'ok',
        message: `View-only permissions updated for Staff account ${account.userCode}.`,
        data: {
          account,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  async listAuditLogs(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const logs = await adminAccountService.listAuditLogs({
        targetUserId: req.query.targetUserId,
        limit: req.query.limit,
      });

      res.status(200).json({
        status: 'ok',
        data: {
          auditLogs: logs,
        },
      });
    } catch (err) {
      next(err);
    }
  },
};
