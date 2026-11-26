import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authController } from '../controllers/authController';
import { requireAuth, requireRole } from '../middleware/authMiddleware';
import { env } from '../config/env';

const authRouter = Router();

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === 'production' ? 15 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    code: 'RATE_LIMIT_EXCEEDED',
    message:
      'Too many authentication attempts from this IP. Please try again after 15 minutes.',
  },
});

// Public Customer Registration (strictly creates CUSTOMER role only)
authRouter.post(
  '/customer/register',
  authRateLimiter,
  authController.registerCustomer
);
authRouter.post('/register', authRateLimiter, authController.registerCustomer);

// Customer Login (mobileNumber + password)
authRouter.post(
  '/customer/login',
  authRateLimiter,
  authController.loginCustomer
);
authRouter.post('/login', authRateLimiter, authController.loginCustomer);

// Authenticated Logout (invalidates token JTI + increments tokenVersion + clears cookie)
authRouter.post('/logout', requireAuth, authController.logout);
authRouter.post('/customer/logout', requireAuth, authController.logout);

// Current Authenticated Customer Session
authRouter.get(
  '/me',
  requireAuth,
  requireRole('CUSTOMER'),
  authController.getCurrentSession
);

export default authRouter;
