import { Router, Request, Response, NextFunction } from 'express';
import {
  requireAuth,
  requireRole,
  requireStaffPermission,
} from '../middleware/authMiddleware';
import { AppError } from '../middleware/notFound';
import { userRepository } from '../repositories/userRepository';
import { toPublicUserProfile } from '../models/User';

const staffRouter = Router();

staffRouter.use(requireAuth);

// Read-only introspection of the Staff member's own Admin-configured permissions
staffRouter.get(
  '/permissions',
  requireRole('STAFF', 'ADMIN'),
  (req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      data: {
        userCode: req.authUser?.userCode,
        role: req.authUser?.role,
        staffPermissions: req.authUser?.staffPermissions ?? [],
        viewOnly: true,
      },
    });
  }
);

// Explicit rejection if Staff attempts to grant or modify their own permissions
staffRouter.patch(
  '/permissions',
  (_req: Request, _res: Response, next: NextFunction) => {
    next(
      new AppError(
        403,
        'FORBIDDEN_SELF_PERMISSION_MODIFICATION',
        'Staff members cannot grant or modify their own permissions. Only an Admin may configure view-only staff permissions.'
      )
    );
  }
);

// Permission-guarded view-only endpoints for Staff
staffRouter.get(
  '/views/customers',
  requireStaffPermission('VIEW_CUSTOMERS'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const customers = await userRepository.listAccounts({ role: 'CUSTOMER' });
      res.status(200).json({
        status: 'ok',
        data: {
          permission: 'VIEW_CUSTOMERS',
          viewOnly: true,
          customers: customers.map(toPublicUserProfile),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

staffRouter.get(
  '/views/farmer-supply',
  requireStaffPermission('VIEW_FARMER_SUPPLY'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const farmers = await userRepository.listAccounts({ role: 'FARMER' });
      res.status(200).json({
        status: 'ok',
        data: {
          permission: 'VIEW_FARMER_SUPPLY',
          viewOnly: true,
          farmers: farmers.map(toPublicUserProfile),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

staffRouter.get(
  '/views/grazing-attendance',
  requireStaffPermission('VIEW_GRAZING_ATTENDANCE'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const workers = await userRepository.listAccounts({
        role: 'GRAZING_WORKER',
      });
      res.status(200).json({
        status: 'ok',
        data: {
          permission: 'VIEW_GRAZING_ATTENDANCE',
          viewOnly: true,
          workers: workers.map(toPublicUserProfile),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

staffRouter.get(
  '/views/daily-deliveries',
  requireStaffPermission('VIEW_DAILY_DELIVERIES'),
  (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      data: {
        permission: 'VIEW_DAILY_DELIVERIES',
        viewOnly: true,
        deliveries: [],
      },
    });
  }
);

staffRouter.get(
  '/views/billing',
  requireStaffPermission('VIEW_BILLING'),
  (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      data: {
        permission: 'VIEW_BILLING',
        viewOnly: true,
        invoices: [],
      },
    });
  }
);

staffRouter.get(
  '/views/product-orders',
  requireStaffPermission('VIEW_PRODUCT_ORDERS'),
  (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      data: {
        permission: 'VIEW_PRODUCT_ORDERS',
        viewOnly: true,
        orders: [],
      },
    });
  }
);

export default staffRouter;
