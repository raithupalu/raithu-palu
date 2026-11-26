import crypto from 'crypto';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { UserModel } from '../models/User';

/**
 * Additive idempotent migration with explicit confirmation safeguards.
 * - Does NOT auto-change legacy milkServiceStatus to PENDING_ACTIVATION unless --confirm flag with explicit list
 * - Requires verified backup (checked via --confirm-backup flag)
 */
async function main() {
  const args = process.argv.slice(2);
  if (!args.includes('--confirm-backup')) {
    console.error('Refusing to run without --confirm-backup. Ensure verified backup exists.');
    process.exit(1);
  }
  if (process.env.NODE_ENV==='production' && !args.includes('--allow-production')) {
    console.error('Production migration blocked without --allow-production');
    process.exit(1);
  }
  const connected = await connectDatabase();
  if (!connected) { console.error('DB connect failed'); process.exit(1); }

  let migrated=0, skipped=0, errors=0;
  const customers = await UserModel.find({ role:'CUSTOMER' }).exec();
  for (const c of customers) {
    try {
      let changed=false;
      // Migrate legacy address → deliveryAddresses if empty
      const hasNew = (c as unknown as { deliveryAddresses?: unknown[] }).deliveryAddresses && ((c as unknown as { deliveryAddresses: unknown[] }).deliveryAddresses.length>0);
      if (!hasNew && (c as unknown as { address?: { line1?:string; pincode?:string; city?:string; deliveryNotes?:string } }).address?.pincode) {
        const legacy = (c as unknown as { address: { line1?:string; line2?:string; landmark?:string; city?:string; pincode?:string; deliveryNotes?:string } }).address;
        const addr = {
          addressId: crypto.randomUUID(),
          label:'HOME' as const,
          line1: legacy.line1 ?? 'Legacy Address',
          line2: legacy.line2,
          landmark: legacy.landmark,
          city: legacy.city,
          pincode: legacy.pincode!,
          deliveryNotes: legacy.deliveryNotes,
          isArchived:false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        (c as unknown as { deliveryAddresses: typeof addr[] }).deliveryAddresses = [addr];
        (c as unknown as { activeDeliveryAddressId: string }).activeDeliveryAddressId = addr.addressId;
        changed=true;
      }
      // Init new fields where missing (do not override existing)
      if ((c as unknown as Record<string,unknown>).milkServiceStatus===undefined || (c as unknown as Record<string,unknown>).milkServiceStatus===null) {
        // Preserve effective ACTIVE for legacy: we set ACTIVE explicitly to make behavior explicit (not PENDING)
        // Only new customers post-cutover will be PENDING; legacy remain ACTIVE unless explicitly approved migration
        (c as unknown as Record<string,unknown>).milkServiceStatus = 'ACTIVE';
        changed=true;
      }
      if ((c as unknown as Record<string,unknown>).productOrderServiceStatus===undefined || (c as unknown as Record<string,unknown>).productOrderServiceStatus===null) {
        (c as unknown as Record<string,unknown>).productOrderServiceStatus = 'ACTIVE';
        changed=true;
      }
      if ((c as unknown as Record<string,unknown>).mustChangePassword===undefined) { (c as unknown as Record<string,unknown>).mustChangePassword=false; changed=true; }
      if ((c as unknown as Record<string,unknown>).tags===undefined) { (c as unknown as Record<string,unknown>).tags=[]; changed=true; }
      if ((c as unknown as Record<string,unknown>).deliveryAddresses===undefined) { (c as unknown as Record<string,unknown>).deliveryAddresses=[]; changed=true; }
      if ((c as unknown as Record<string,unknown>).activeDeliveryAddressId===undefined) { (c as unknown as Record<string,unknown>).activeDeliveryAddressId=null; changed=true; }
      if (changed) { await c.save(); migrated++; } else skipped++;
    } catch (e) { console.error('Error migrating', c.userCode, e); errors++; }
  }
  console.log(`Migration complete: migrated=${migrated} skipped=${skipped} errors=${errors}`);
  await disconnectDatabase();
}

if (require.main===module) void main();
