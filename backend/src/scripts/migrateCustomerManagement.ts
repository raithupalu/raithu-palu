import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { UserModel } from '../models/User';

/**
 * Additive idempotent migration with explicit confirmation safeguards.
 * - Does NOT auto-change legacy milkServiceStatus to PENDING_ACTIVATION unless explicitly approved
 * - Requires operator-supplied backup evidence: --backup-evidence <path> must point to an existing file
 *   the operator claims is a backup manifest/snapshot identifier (e.g., mongodump checksum file or Atlas
 *   snapshot ID text file). This file existence/mtime check is NOT proof of backup integrity and does NOT
 *   verify the backup is restorable — it is only operator-supplied evidence that an external backup
 *   verification step was performed (via Atlas UI snapshot verification or mongodump --oplog + checksum
 *   validated out-of-band). --confirm-backup alone is NOT verification; it is only operator acknowledgement.
 * - Exits non-zero if any customer migration fails.
 * - Preserves additive, idempotent behavior and legacy ACTIVE fallback.
 * - IMPORTANT: This script does NOT execute automatically; operator must run it explicitly after verification.
 */
async function main() {
  const args = process.argv.slice(2);
  // Backup evidence check: require --backup-evidence <path> that exists and is recent (within 7 days)
  const evidenceIdx = args.indexOf('--backup-evidence');
  let evidencePath: string | null = null;
  if (evidenceIdx !== -1) {
    evidencePath = args[evidenceIdx + 1];
    if (!evidencePath) {
      console.error('Usage: --backup-evidence <path-to-backup-manifest-or-snapshot-info> is required');
      process.exit(1);
    }
    const resolved = path.resolve(evidencePath);
    if (!fs.existsSync(resolved)) {
      console.error(`Backup evidence not found at ${resolved}. Provide path to operator-supplied evidence file (e.g., mongodump checksum text or Atlas snapshot ID file).`);
      console.error('NOTE: This check only verifies file existence/mtime — it does NOT prove backup integrity or restorability.');
      console.error('Operator must have verified backup out-of-band via Atlas UI snapshot check or mongodump --oplog + checksum before running migration.');
      process.exit(1);
    }
    try {
      const stat = fs.statSync(resolved);
      const ageMs = Date.now() - stat.mtimeMs;
      const sevenDaysMs = 7 * 24 * 3600 * 1000;
      if (ageMs > sevenDaysMs) {
        console.warn(`Warning: backup evidence file is older than 7 days (age ${Math.floor(ageMs/3600000)}h). Ensure backup is recent.`);
      }
      console.info(`Backup evidence (operator-supplied) found: ${resolved} (mtime: ${stat.mtime.toISOString()}, size: ${stat.size} bytes)`);
      console.info('NOTE: File existence is operator evidence only — not proof of backup integrity. External verification must have been completed separately.');
    } catch (e) {
      console.error('Failed to verify backup evidence file:', e);
      process.exit(1);
    }
  } else {
    console.error('Refusing to run without --backup-evidence <path>. Operator must provide path to operator-supplied backup evidence file.');
    console.error('This is evidence (file existence) that operator claims external verification was done — not proof of backup integrity.');
    console.error('External verification required out-of-band: Atlas snapshot ID file or mongodump checksum. --confirm-backup alone is operator confirmation, not verification.');
    process.exit(1);
  }
  // Retain --confirm-backup as additional operator acknowledgement (must be present together with evidence)
  if (!args.includes('--confirm-backup')) {
    console.error('Refusing to run without --confirm-backup. After verifying backup evidence, add --confirm-backup to acknowledge.');
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
      if ((c as unknown as Record<string,unknown>).milkServiceStatus===undefined || (c as unknown as Record<string,unknown>).milkServiceStatus===null) {
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
  if (errors > 0) {
    console.error(`Migration completed with ${errors} failures — exiting non-zero for operator attention`);
    process.exit(1);
  }
}

if (require.main===module) void main();
