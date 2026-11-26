import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../middleware/authMiddleware';
import { customerManagementController } from '../controllers/customerManagementController';

const router = Router();

// All routes require ADMIN
router.use(requireAuth, requireRole('ADMIN'));

// Bulk import with memory storage, 2MB limit
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

router.post('/bulk-import', upload.single('file'), customerManagementController.bulkImport);
router.post('/', customerManagementController.createCustomer);
router.get('/', customerManagementController.listCustomers);
router.get('/:id', customerManagementController.getCustomerDetail);
router.patch('/:id', customerManagementController.updateCustomer);
router.patch('/:id/status', customerManagementController.updateAccountStatus);
router.patch('/:id/milk-service-status', customerManagementController.updateMilkServiceStatus);
router.patch('/:id/product-order-service-status', customerManagementController.updateProductOrderServiceStatus);
router.patch('/:id/weekly-schedule', customerManagementController.updateWeeklySchedule);
router.get('/:id/timeline', customerManagementController.getTimeline);
router.post('/:id/notes', customerManagementController.createNote);
router.get('/:id/notes', customerManagementController.listNotes);
// Address management (admin)
router.post('/:id/addresses', customerManagementController.addAddress);
router.patch('/:id/addresses/:addressId', customerManagementController.updateAddress);
router.post('/:id/addresses/:addressId/activate', customerManagementController.activateAddress);
router.post('/:id/addresses/:addressId/archive', customerManagementController.archiveAddress);

export default router;
