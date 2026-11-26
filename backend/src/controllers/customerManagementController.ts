import { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/notFound';
import { customerManagementService } from '../services/customerManagementService';

export const customerManagementController = {
  async createCustomer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.authUser) throw new AppError(401,'AUTHENTICATION_REQUIRED','Authentication required');
      const body = (req.body ?? {}) as Record<string, unknown>;
      const customer = await customerManagementService.createCustomer(req.authUser, body);
      res.status(201).json({ status:'ok', message:`Customer ${customer.userCode} created`, data:{ customer } });
    } catch (err) { next(err); }
  },
  async listCustomers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await customerManagementService.listCustomers({
        search: req.query.search,
        status: req.query.status,
        milkServiceStatus: req.query.milkServiceStatus,
        productOrderServiceStatus: req.query.productOrderServiceStatus,
        pincode: req.query.pincode,
        tags: req.query.tags,
        page: req.query.page,
        limit: req.query.limit,
        sort: req.query.sort,
      });
      res.status(200).json({ status:'ok', data: result });
    } catch (err) { next(err); }
  },
  async getCustomerDetail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await customerManagementService.getCustomerDetail(String(req.params.id ?? ''));
      res.status(200).json({ status:'ok', data: result });
    } catch (err) { next(err); }
  },
  async updateCustomer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.authUser) throw new AppError(401,'AUTHENTICATION_REQUIRED','Authentication required');
      const body = (req.body ?? {}) as Record<string, unknown>;
      const customer = await customerManagementService.updateCustomerAdmin(req.authUser, String(req.params.id ?? ''), body);
      res.status(200).json({ status:'ok', message:`Customer ${customer.userCode} updated`, data:{ customer } });
    } catch (err) { next(err); }
  },
  async updateAccountStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.authUser) throw new AppError(401,'AUTHENTICATION_REQUIRED','Authentication required');
      const body = (req.body ?? {}) as Record<string, unknown>;
      const result = await customerManagementService.updateAccountStatus(req.authUser, String(req.params.id ?? ''), body);
      res.status(200).json({ status:'ok', message:`Status updated to ${result.account.status}`, data: result });
    } catch (err) { next(err); }
  },
  async updateMilkServiceStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.authUser) throw new AppError(401,'AUTHENTICATION_REQUIRED','Authentication required');
      const body = (req.body ?? {}) as Record<string, unknown>;
      const customer = await customerManagementService.updateMilkServiceStatus(req.authUser, String(req.params.id ?? ''), body);
      res.status(200).json({ status:'ok', data:{ customer } });
    } catch (err) { next(err); }
  },
  async updateProductOrderServiceStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.authUser) throw new AppError(401,'AUTHENTICATION_REQUIRED','Authentication required');
      const body = (req.body ?? {}) as Record<string, unknown>;
      const customer = await customerManagementService.updateProductOrderServiceStatus(req.authUser, String(req.params.id ?? ''), body);
      res.status(200).json({ status:'ok', data:{ customer } });
    } catch (err) { next(err); }
  },
  async updateWeeklySchedule(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.authUser) throw new AppError(401,'AUTHENTICATION_REQUIRED','Authentication required');
      const body = (req.body ?? {}) as Record<string, unknown>;
      const customer = await customerManagementService.updateWeeklySchedule(req.authUser, String(req.params.id ?? ''), body);
      res.status(200).json({ status:'ok', data:{ customer } });
    } catch (err) { next(err); }
  },
  async createNote(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.authUser) throw new AppError(401,'AUTHENTICATION_REQUIRED','Authentication required');
      const body = (req.body ?? {}) as Record<string, unknown>;
      const note = await customerManagementService.createNote(req.authUser, String(req.params.id ?? ''), body.body);
      res.status(201).json({ status:'ok', data:{ note } });
    } catch (err) { next(err); }
  },
  async listNotes(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await customerManagementService.listNotes(String(req.params.id ?? ''), req.query.page, req.query.limit);
      res.status(200).json({ status:'ok', data: result });
    } catch (err) { next(err); }
  },
  async getTimeline(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await customerManagementService.getTimeline(String(req.params.id ?? ''), req.query.page, req.query.limit);
      res.status(200).json({ status:'ok', data: result });
    } catch (err) { next(err); }
  },
  async addAddress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.authUser) throw new AppError(401,'AUTHENTICATION_REQUIRED','Authentication required');
      const body = (req.body ?? {}) as Record<string, unknown>;
      const customer = await customerManagementService.addAddress(req.authUser, String(req.params.id ?? ''), body);
      res.status(201).json({ status:'ok', data:{ customer } });
    } catch (err) { next(err); }
  },
  async updateAddress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.authUser) throw new AppError(401,'AUTHENTICATION_REQUIRED','Authentication required');
      const body = (req.body ?? {}) as Record<string, unknown>;
      const customer = await customerManagementService.updateAddress(req.authUser, String(req.params.id ?? ''), String(req.params.addressId ?? ''), body);
      res.status(200).json({ status:'ok', data:{ customer } });
    } catch (err) { next(err); }
  },
  async activateAddress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.authUser) throw new AppError(401,'AUTHENTICATION_REQUIRED','Authentication required');
      const customer = await customerManagementService.activateAddress(req.authUser, String(req.params.id ?? ''), String(req.params.addressId ?? ''));
      res.status(200).json({ status:'ok', data:{ customer } });
    } catch (err) { next(err); }
  },
  async archiveAddress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.authUser) throw new AppError(401,'AUTHENTICATION_REQUIRED','Authentication required');
      const customer = await customerManagementService.archiveAddress(req.authUser, String(req.params.id ?? ''), String(req.params.addressId ?? ''));
      res.status(200).json({ status:'ok', data:{ customer } });
    } catch (err) { next(err); }
  },
  async bulkImport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.authUser) throw new AppError(401,'AUTHENTICATION_REQUIRED','Authentication required');
      const file = (req as unknown as { file?: { buffer: Buffer; originalname:string; size:number } }).file;
      if (!file) throw new AppError(400,'VALIDATION_ERROR','File is required for bulk import');
      const dryRun = req.query.dryRun === 'true';
      const result = await customerManagementService.bulkImport(req.authUser, file.buffer, file.originalname, dryRun);
      res.status(200).json({ status:'ok', data: result });
    } catch (err) { next(err); }
  },
};
