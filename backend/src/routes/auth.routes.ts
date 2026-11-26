import { Router } from 'express';
import { authController } from '../controllers/authController';
import { requireAuth } from '../middleware/authMiddleware';

const authRouter = Router();

// Customer self-registration endpoints (Admin & managed roles cannot self-register)
authRouter.post('/customer/register', authController.registerCustomer);
authRouter.post('/register', authController.registerCustomer);

// Customer-specific login endpoint
authRouter.post('/customer/login', authController.loginCustomer);

// Admin-specific login endpoint (requires manual operator provisioning first)
authRouter.post('/admin/login', authController.loginAdmin);

// Unified role-aware login endpoint (authenticates active ADMIN, CUSTOMER, STAFF, FARMER, GRAZING_WORKER)
authRouter.post('/login', authController.loginAnyRole);

// Authenticated session & logout endpoints
authRouter.post('/logout', requireAuth, authController.logout);
authRouter.get('/me', requireAuth, authController.getSession);
authRouter.post('/change-password', requireAuth, authController.changePassword);

export default authRouter;
