import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/authMiddleware';
import { adminAccountController } from '../controllers/adminAccountController';

const adminRouter = Router();

// All Admin account-management endpoints require an authenticated, active ADMIN session
adminRouter.use(requireAuth, requireRole('ADMIN'));

// Account listing & creation
adminRouter.get('/accounts', adminAccountController.listAccounts);
adminRouter.post('/accounts', adminAccountController.createAccount);

// Account details, update, status management, and custom view-only staff permissions
adminRouter.get('/accounts/:id', adminAccountController.getAccountDetails);
adminRouter.patch('/accounts/:id', adminAccountController.updateAccount);
adminRouter.patch(
  '/accounts/:id/status',
  adminAccountController.updateAccountStatus
);
adminRouter.patch(
  '/accounts/:id/permissions',
  adminAccountController.updateStaffPermissions
);

// Audit log inspection for account-management operations
adminRouter.get('/audit-logs', adminAccountController.listAuditLogs);

export default adminRouter;
