import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export type NodeEnv = 'development' | 'test' | 'production';

export interface EnvConfig {
  NODE_ENV: NodeEnv;
  HOST: string;
  PORT: number;
  MONGODB_URI: string;
  CORS_ORIGIN: string;
  JSON_BODY_LIMIT: string;
  DB_CONNECT_TIMEOUT_MS: number;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  BCRYPT_SALT_ROUNDS: number;
  ALLOW_IN_MEMORY_AUTH_FALLBACK: boolean;
}

const VALID_NODE_ENVS: readonly NodeEnv[] = ['development', 'test', 'production'];

export function validateEnv(rawEnv: NodeJS.ProcessEnv = process.env): EnvConfig {
  const errors: string[] = [];

  const nodeEnvRaw = (rawEnv.NODE_ENV ?? 'development').trim();
  if (!VALID_NODE_ENVS.includes(nodeEnvRaw as NodeEnv)) {
    errors.push(
      `Invalid NODE_ENV "${nodeEnvRaw}". Expected one of: ${VALID_NODE_ENVS.join(', ')}.`
    );
  }

  const host = (rawEnv.HOST ?? '0.0.0.0').trim();
  if (!host) {
    errors.push('Invalid HOST: value cannot be empty.');
  }

  const portRaw = (rawEnv.PORT ?? '5000').trim();
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push(`Invalid PORT "${portRaw}". Expected an integer between 1 and 65535.`);
  }

  const mongoUri = (rawEnv.MONGODB_URI ?? '').trim();
  if (!mongoUri) {
    errors.push(
      'Missing required environment variable MONGODB_URI. Provide a valid MongoDB Atlas or replica-set connection string (see .env.example).'
    );
  } else if (
    !mongoUri.startsWith('mongodb://') &&
    !mongoUri.startsWith('mongodb+srv://')
  ) {
    errors.push(
      'Invalid MONGODB_URI format. Connection string must begin with "mongodb://" or "mongodb+srv://".'
    );
  }

  const corsOrigin = (rawEnv.CORS_ORIGIN ?? '').trim();
  if (!corsOrigin) {
    errors.push(
      'Missing required environment variable CORS_ORIGIN. Specify the allowed frontend origin(s), e.g. http://localhost:5173.'
    );
  }

  const jsonBodyLimit = (rawEnv.JSON_BODY_LIMIT ?? '100kb').trim();
  if (!/^\d+(\.\d+)?(b|kb|mb)$/i.test(jsonBodyLimit)) {
    errors.push(
      `Invalid JSON_BODY_LIMIT "${jsonBodyLimit}". Expected a size string such as "100kb" or "1mb".`
    );
  }

  const timeoutRaw = (rawEnv.DB_CONNECT_TIMEOUT_MS ?? '5000').trim();
  const dbConnectTimeoutMs = Number(timeoutRaw);
  if (!Number.isInteger(dbConnectTimeoutMs) || dbConnectTimeoutMs < 500) {
    errors.push(
      `Invalid DB_CONNECT_TIMEOUT_MS "${timeoutRaw}". Expected an integer >= 500.`
    );
  }

  const jwtSecret = (rawEnv.JWT_SECRET ?? '').trim();
  if (!jwtSecret) {
    errors.push(
      'Missing required environment variable JWT_SECRET. Provide a strong secret of at least 32 characters.'
    );
  } else if (jwtSecret.length < 32) {
    errors.push(
      'Invalid JWT_SECRET: secret must be at least 32 characters long for cryptographic security.'
    );
  }

  const jwtExpiresIn = (rawEnv.JWT_EXPIRES_IN ?? '7d').trim();
  if (!/^\d+(s|m|h|d)$/i.test(jwtExpiresIn)) {
    errors.push(
      `Invalid JWT_EXPIRES_IN "${jwtExpiresIn}". Expected a duration string such as "15m", "24h", or "7d".`
    );
  }

  const saltRoundsRaw = (rawEnv.BCRYPT_SALT_ROUNDS ?? '12').trim();
  const bcryptSaltRounds = Number(saltRoundsRaw);
  if (
    !Number.isInteger(bcryptSaltRounds) ||
    bcryptSaltRounds < 10 ||
    bcryptSaltRounds > 15
  ) {
    errors.push(
      `Invalid BCRYPT_SALT_ROUNDS "${saltRoundsRaw}". Expected an integer between 10 and 15.`
    );
  }

  const fallbackRaw = (rawEnv.ALLOW_IN_MEMORY_AUTH_FALLBACK ?? 'false')
    .trim()
    .toLowerCase();
  if (fallbackRaw !== 'true' && fallbackRaw !== 'false') {
    errors.push(
      `Invalid ALLOW_IN_MEMORY_AUTH_FALLBACK "${fallbackRaw}". Expected "true" or "false".`
    );
  }
  const allowInMemoryAuthFallback = fallbackRaw === 'true';
  if (nodeEnvRaw === 'production' && allowInMemoryAuthFallback) {
    errors.push(
      'ALLOW_IN_MEMORY_AUTH_FALLBACK cannot be enabled when NODE_ENV is "production".'
    );
  }

  if (errors.length > 0) {
    const message = [
      'Environment configuration validation failed:',
      ...errors.map((err) => `  - ${err}`),
    ].join('\n');
    throw new Error(message);
  }

  return {
    NODE_ENV: nodeEnvRaw as NodeEnv,
    HOST: host,
    PORT: port,
    MONGODB_URI: mongoUri,
    CORS_ORIGIN: corsOrigin,
    JSON_BODY_LIMIT: jsonBodyLimit,
    DB_CONNECT_TIMEOUT_MS: dbConnectTimeoutMs,
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN: jwtExpiresIn,
    BCRYPT_SALT_ROUNDS: bcryptSaltRounds,
    ALLOW_IN_MEMORY_AUTH_FALLBACK: allowInMemoryAuthFallback,
  };
}

export const env: EnvConfig = validateEnv();
