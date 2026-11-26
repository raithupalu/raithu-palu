import { Router } from 'express';
import { customerProfileController } from '../controllers/customerProfileController';
import { authController } from '../controllers/authController';
import { requireAuth, requireRole, enforceMustChangePassword } from '../middleware/authMiddleware';

const customerRouter = Router();

// Change-password is allowed even when mustChangePassword true
customerRouter.post('/change-password', requireAuth, requireRole('CUSTOMER'), authController.changePassword);

// All other customer routes enforce mustChangePassword restriction
customerRouter.use(requireAuth, requireRole('CUSTOMER'), enforceMustChangePassword);

customerRouter.get('/profile', customerProfileController.getProfile);
customerRouter.patch('/profile', customerProfileController.updateProfile);

// Delivery address self-service
customerRouter.post('/addresses', customerProfileController.addAddress);
customerRouter.patch('/addresses/:addressId', customerProfileController.updateAddress);
customerRouter.post('/addresses/:addressId/activate', customerProfileController.activateAddress);
customerRouter.post('/addresses/:addressId/archive', customerProfileController.archiveAddress);

export default customerRouter;
