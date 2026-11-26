import crypto from 'crypto';
import mongoose from 'mongoose';
import { env } from '../config/env';
import {
  connectDatabase,
  disconnectDatabase,
  getDatabaseHealth,
} from '../config/database';

/**
 * One-time MongoDB production connectivity & persistence verification script.
 *
 * Guarantees:
 * - Uses existing Mongoose configuration and MONGODB_URI (via connectDatabase/env).
 * - Production-only guard (refuses unless NODE_ENV === "production").
 * - Operates exclusively on a dedicated `deployment_verification` collection.
 * - Inserts one uniquely identifiable temporary document, reads it back, verifies contents, deletes only that document.
 * - try/finally ensures cleanup + disconnect.
 * - Any cleanup failure or document remaining after deletion is treated as verification failure (exitCode=1).
 * - Never logs MONGODB_URI, credentials, hostnames, or raw connection errors.
 */

const COLLECTION_NAME = 'deployment_verification';
const SENTINEL_VALUE = 'RAITHU_PALU_PERSISTENCE_OK';
const SERVICE_NAME = 'raithu-palu-backend';

interface DeploymentVerificationDoc {
  _id: mongoose.Types.ObjectId;
  verificationRunId: string;
  service: string;
  environment: string;
  sentinelValue: string;
  createdAt: Date;
}

const deploymentVerificationSchema = new mongoose.Schema<DeploymentVerificationDoc>(
  {
    _id: { type: mongoose.Schema.Types.ObjectId, required: true },
    verificationRunId: { type: String, required: true },
    service: { type: String, required: true },
    environment: { type: String, required: true },
    sentinelValue: { type: String, required: true },
    createdAt: { type: Date, required: true },
  },
  {
    collection: COLLECTION_NAME,
    versionKey: false,
    strict: true,
  }
);

// Reuse model if already registered (tsx watch / repeated imports), otherwise register.
const DeploymentVerificationModel =
  (mongoose.models.DeploymentVerification as
    | mongoose.Model<DeploymentVerificationDoc>
    | undefined) ??
  mongoose.model<DeploymentVerificationDoc>(
    'DeploymentVerification',
    deploymentVerificationSchema,
    COLLECTION_NAME
  );

function fail(message: string, details?: Record<string, unknown>): never {
  // Never include env.MONGODB_URI, credentials, hostnames, or raw driver errors.
  console.error(
    JSON.stringify(
      {
        status: 'error',
        stage: details?.stage ?? 'UNKNOWN',
        message,
        verificationRunId: details?.verificationRunId,
        collection: COLLECTION_NAME,
      },
      null,
      2
    )
  );
  process.exitCode = 1;
  // Throw to unwind to finally for cleanup; outer catch will suppress duplicate logging if exitCode already set.
  throw new Error(message);
}

export async function runVerifyMongoPersistence(): Promise<void> {
  // 1. Production-only guard — evaluated before any DB work. env.NODE_ENV is validated in env.ts.
  if (env.NODE_ENV !== 'production') {
    console.error(
      JSON.stringify(
        {
          status: 'error',
          stage: 'GUARD',
          message:
            'Refusing to run: NODE_ENV must be "production". This verification script is production-only.',
          expected: 'production',
          received: env.NODE_ENV,
        },
        null,
        2
      )
    );
    process.exitCode = 1;
    return;
  }

  const verificationRunId = crypto.randomUUID();
  const docId = new mongoose.Types.ObjectId();
  const createdAt = new Date();

  let insertedDocId: mongoose.Types.ObjectId | null = null;
  let cleanupCompleted = false;

  try {
    // 2. Connect using existing configuration. connectDatabase() returns false on failure (does not throw).
    const connected = await connectDatabase();
    const health = getDatabaseHealth();

    if (!connected || !health.connected || health.state !== 'connected') {
      fail(
        'Database connection failed. Verify MONGODB_URI points to a reachable MongoDB Atlas cluster and that Render environment variables are set.',
        { stage: 'CONNECT', verificationRunId }
      );
    }

    // 3. Insert uniquely identifiable temporary document into dedicated collection.
    try {
      await DeploymentVerificationModel.create({
        _id: docId,
        verificationRunId,
        service: SERVICE_NAME,
        environment: env.NODE_ENV,
        sentinelValue: SENTINEL_VALUE,
        createdAt,
      });
      insertedDocId = docId;
    } catch {
      fail('Failed to insert verification document into deployment_verification collection.', {
        stage: 'INSERT',
        verificationRunId,
      });
    }

    // 4. Read back and verify contents strictly.
    let readDoc: DeploymentVerificationDoc | null;
    try {
      readDoc = await DeploymentVerificationModel.findOne({
        _id: docId,
        verificationRunId,
      })
        .lean<DeploymentVerificationDoc>()
        .exec();
    } catch {
      fail('Failed to read back verification document.', {
        stage: 'READ',
        verificationRunId,
      });
    }

    if (!readDoc) {
      fail('Verification document not found after insert. Persistence check failed.', {
        stage: 'READ_VERIFY',
        verificationRunId,
      });
    }

    if (
      readDoc._id.toString() !== docId.toString() ||
      readDoc.verificationRunId !== verificationRunId ||
      readDoc.sentinelValue !== SENTINEL_VALUE ||
      readDoc.service !== SERVICE_NAME
    ) {
      fail(
        'Verification document contents do not match expected values. Persistence check failed.',
        { stage: 'READ_VERIFY', verificationRunId }
      );
    }

    // 5. Delete only the exact temporary document (by _id AND verificationRunId).
    try {
      const deleteResult = await DeploymentVerificationModel.deleteOne({
        _id: docId,
        verificationRunId,
      }).exec();

      if (deleteResult.deletedCount !== 1) {
        fail(
          'Deletion did not remove exactly one verification document. Treating as verification failure.',
          { stage: 'DELETE', verificationRunId }
        );
      }
    } catch {
      fail('Failed to delete verification document during primary cleanup.', {
        stage: 'DELETE',
        verificationRunId,
      });
    }

    // 6. Confirm deletion — document must no longer exist.
    try {
      const postDeleteDoc = await DeploymentVerificationModel.findOne({
        _id: docId,
      })
        .lean()
        .exec();

      if (postDeleteDoc) {
        fail(
          'Verification document still exists after deletion. Cleanup verification failed.',
          { stage: 'DELETE_VERIFY', verificationRunId }
        );
      }
      cleanupCompleted = true;
    } catch {
      fail('Failed to verify deletion of temporary document.', {
        stage: 'DELETE_VERIFY',
        verificationRunId,
      });
    }

    // Success — structured, secret-free output.
    console.log(
      JSON.stringify(
        {
          status: 'ok',
          stage: 'VERIFIED',
          message:
            'MongoDB connectivity and persistence verified: insert, read, and cleanup succeeded.',
          collection: COLLECTION_NAME,
          verificationRunId,
          documentId: docId.toString(),
          inserted: true,
          readVerified: true,
          deletedVerified: true,
          databaseState: getDatabaseHealth().state,
        },
        null,
        2
      )
    );
  } catch (err) {
    // If fail() already set exitCode and logged, do not log again with raw error.
    if (process.exitCode !== 1) {
      const errorName = err instanceof Error ? err.name : 'UnknownError';
      console.error(
        JSON.stringify(
          {
            status: 'error',
            stage: 'UNKNOWN',
            message: 'Verification failed due to an unexpected error.',
            errorName,
            verificationRunId,
            collection: COLLECTION_NAME,
          },
          null,
          2
        )
      );
      process.exitCode = 1;
    }
  } finally {
    // 7. try/finally guarantee: best-effort cleanup of the exact document if not yet confirmed deleted,
    //    then always close the connection. Any cleanup failure is a verification failure.
    if (insertedDocId && !cleanupCompleted) {
      try {
        if (mongoose.connection.readyState === 1) {
          await DeploymentVerificationModel.deleteOne({
            _id: insertedDocId,
            verificationRunId,
          }).exec();

          const residual = await DeploymentVerificationModel.findOne({
            _id: insertedDocId,
          })
            .lean()
            .exec();

          if (residual) {
            console.error(
              JSON.stringify(
                {
                  status: 'error',
                  stage: 'CLEANUP_VERIFY',
                  message:
                    'Cleanup failed: temporary verification document still exists after finally-block deletion attempt.',
                  verificationRunId,
                  documentId: insertedDocId.toString(),
                  collection: COLLECTION_NAME,
                },
                null,
                2
              )
            );
            process.exitCode = 1;
          }
        }
      } catch {
        console.error(
          JSON.stringify(
            {
              status: 'error',
              stage: 'CLEANUP',
              message: 'Cleanup failed while attempting to remove temporary verification document.',
              verificationRunId,
              documentId: insertedDocId.toString(),
              collection: COLLECTION_NAME,
            },
            null,
            2
          )
        );
        process.exitCode = 1;
      }
    }

    try {
      await disconnectDatabase();
    } catch {
      // Never log raw disconnect error (may contain connection details).
      console.error(
        JSON.stringify(
          {
            status: 'error',
            stage: 'DISCONNECT',
            message: 'Failed to close database connection cleanly.',
            verificationRunId,
          },
          null,
          2
        )
      );
      process.exitCode = 1;
    }
  }
}

if (require.main === module) {
  void runVerifyMongoPersistence();
}
