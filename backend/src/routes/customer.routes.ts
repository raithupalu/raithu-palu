import { Router } from 'express';
import { customerProfileController } from '../controllers/customerProfileController';
import { requireAuth, requireRole } from '../middleware/authMiddleware';

const customerRouter = Router();

// All customer routes require valid authentication and CUSTOMER role
customerRouter.use(requireAuth, requireRole('CUSTOMER'));

customerRouter.get('/profile', customerProfileController.getProfile);
customerRouter.patch('/profile', customerProfileController.updateProfile);

export default customerRouter;
