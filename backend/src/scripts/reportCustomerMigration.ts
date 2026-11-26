import { connectDatabase, disconnectDatabase } from '../config/database';
import { UserModel } from '../models/User';
import fs from 'fs';
import path from 'path';

/**
 * Read-only migration report: scans CUSTOMER records, outputs IDs, legacy addresses, schedules, service info.
 * No DB writes.
 */
async function main() {
  const connected = await connectDatabase();
  if (!connected) {
    console.error('Failed to connect to database');
    process.exit(1);
  }
  const customers = await UserModel.find({ role:'CUSTOMER' }).lean().exec();
  const report = customers.map(c=> ({
    customerId: c.userCode,
    id: c._id.toString(),
    fullName: c.fullName,
    mobileNumber: c.mobileNumber,
    status: c.status,
    milkServiceStatus: (c as unknown as Record<string,unknown>).milkServiceStatus ?? null,
    productOrderServiceStatus: (c as unknown as Record<string,unknown>).productOrderServiceStatus ?? null,
    legacyAddress: (c as unknown as Record<string,unknown>).address ?? null,
    deliveryAddressesCount: ((c as unknown as Record<string,unknown>).deliveryAddresses as unknown[])?.length ?? 0,
    deliveryAddresses: (c as unknown as Record<string,unknown>).deliveryAddresses ?? [],
    activeDeliveryAddressId: (c as unknown as Record<string,unknown>).activeDeliveryAddressId ?? null,
    weeklyMilkSchedule: (c as unknown as Record<string,unknown>).weeklyMilkSchedule ?? null,
    tags: (c as unknown as Record<string,unknown>).tags ?? [],
    mustChangePassword: (c as unknown as Record<string,unknown>).mustChangePassword ?? false,
    createdAt: c.createdAt,
  }));
  const summary = {
    totalCustomers: report.length,
    withLegacyAddress: report.filter(r=> r.legacyAddress && (r.legacyAddress as Record<string,unknown>).pincode).length,
    withNewAddresses: report.filter(r=> r.deliveryAddressesCount>0).length,
    withSchedule: report.filter(r=> r.weeklyMilkSchedule).length,
    withoutMilkServiceStatus: report.filter(r=> !r.milkServiceStatus).length,
    report,
  };
  const outPath = path.resolve(process.cwd(), `migration-report-${new Date().toISOString().slice(0,10)}.json`);
  fs.writeFileSync(outPath, JSON.stringify(summary,null,2),'utf8');
  console.log(`Migration report written to ${outPath}`);
  console.log(JSON.stringify(summary,null,2));
  await disconnectDatabase();
}

if (require.main===module) void main();
