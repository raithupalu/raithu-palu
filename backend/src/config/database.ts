import mongoose from 'mongoose';
import { env } from './env';

/**
 * MongoDB / Mongoose Connection Module
 *
 * Architectural Requirement (v12):
 * Financial operations in later phases (customer payments, FIFO invoice allocations,
 * advance deposits/applications/refunds, payment reversals, and concurrency guards)
 * require multi-document ACID transactions.
 *
 * IMPORTANT:
 * - Standalone MongoDB instances DO NOT support multi-document transactions.
 * - Deployment MUST use MongoDB Atlas (all tiers support replica set transactions)
 *   or a self-managed MongoDB replica set (rs.initiate()).
 * - Never log or expose MONGODB_URI, credentials, or internal host details.
 */

export type DatabaseConnectionState =
  | 'disconnected'
  | 'connected'
  | 'connecting'
  | 'disconnecting'
  | 'uninitialized';

export interface DatabaseHealthStatus {
  connected: boolean;
  state: DatabaseConnectionState;
}

const READY_STATE_MAP: Record<number, DatabaseConnectionState> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
  99: 'uninitialized',
};

let listenersRegistered = false;

function registerConnectionListeners(): void {
  if (listenersRegistered) {
    return;
  }
  listenersRegistered = true;

  mongoose.connection.on('connected', () => {
    console.info('[Database] Mongoose connection established.');
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[Database] Mongoose connection disconnected.');
  });

  mongoose.connection.on('reconnected', () => {
    console.info('[Database] Mongoose connection re-established.');
  });

  mongoose.connection.on('error', () => {
    // Log generic message only; never print error objects that could contain connection strings
    console.error('[Database] Mongoose connection error encountered.');
  });
}

export function getDatabaseHealth(): DatabaseHealthStatus {
  const readyState = mongoose.connection.readyState;
  const state: DatabaseConnectionState =
    READY_STATE_MAP[readyState] ?? 'uninitialized';

  return {
    connected: readyState === 1,
    state,
  };
}

export async function connectDatabase(): Promise<boolean> {
  registerConnectionListeners();

  try {
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: env.DB_CONNECT_TIMEOUT_MS,
      autoIndex: env.NODE_ENV !== 'production',
    });
    return true;
  } catch {
    console.warn(
      '[Database] Could not reach MongoDB within timeout. Application will continue starting; verify MONGODB_URI points to a running MongoDB Atlas cluster or replica set.'
    );
    return false;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
