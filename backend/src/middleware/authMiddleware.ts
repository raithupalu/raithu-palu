import { Request, Response, NextFunction } from 'express';
import { AppError } from './notFound';
import {
  PublicUserProfile,
  toPublicUserProfile,
  UserRole,
  StaffPermission,
} from '../models/User';
import {
  JwtAccessPayload,
  verifyAccessToken,
} from '../services/authService';
import { userRepository } from '../repositories/userRepository';

export const AUTH_COOKIE_NAME = 'rp_access_token';

export type AuthTokenSource =
  | 'authorization_bearer'
  | 'cookie_rp_access_token'
  | 'none';

export type AuthFailureStage =
  | 'NONE'
  | 'TOKEN_EXTRACTION'
  | 'JWT_VERIFICATION'
  | 'USER_LOOKUP'
  | 'ACCOUNT_STATUS'
  | 'TOKEN_VERSION'
  | 'ROLE_AUTHORIZATION'
  | 'STAFF_PERMISSION';

export interface AuthRequestDiagnostics {
  authorizationHeaderPresent: boolean;
  bearerTokenExtracted: boolean;
  cookieHeaderPresent: boolean;
  rpAccessTokenCookieExtracted: boolean;
  tokenSource: AuthTokenSource;
  failureStage: AuthFailureStage;
  errorCode: string | null;
}

export interface TokenCandidateEntry {
  token: string;
  source: Exclude<AuthTokenSource, 'none'>;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: PublicUserProfile;
      authTokenPayload?: JwtAccessPayload;
      authDiagnostics?: AuthRequestDiagnostics;
    }
  }
}

function sanitizeCandidateToken(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const unquoted = raw.trim().replace(/^["']+|["']+$/g, '').trim();
  if (
    !unquoted ||
    unquoted === 'undefined' ||
    unquoted === 'null' ||
    unquoted === '[object Object]'
  ) {
    return null;
  }
  return unquoted;
}

function extractBearerFromAuthorizationHeader(
  authHeader: unknown
): string | null {
  if (typeof authHeader === 'string') {
    const trimmed = authHeader.trim();
    if (!trimmed) {
      return null;
    }

    const bearerMatch = /^Bearer\s+(.+)$/i.exec(trimmed);
    if (bearerMatch && bearerMatch[1]) {
      return sanitizeCandidateToken(bearerMatch[1]);
    }

    const directCandidate = sanitizeCandidateToken(trimmed);
    if (
      directCandidate &&
      /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(directCandidate)
    ) {
      return directCandidate;
    }
  }
  return null;
}

function extractCookieToken(req: Request): string | null {
  const parsedCookies = (req as Request & { cookies?: Record<string, unknown> })
    .cookies;
  const fromCookieParser = sanitizeCandidateToken(
    parsedCookies?.[AUTH_COOKIE_NAME]
  );
  if (fromCookieParser) {
    return fromCookieParser;
  }

  const rawCookieHeader = req.headers.cookie;
  if (typeof rawCookieHeader === 'string' && rawCookieHeader.length > 0) {
    const segments = rawCookieHeader.split(';');
    for (const segment of segments) {
      const eqIndex = segment.indexOf('=');
      if (eqIndex === -1) continue;
      const name = segment.slice(0, eqIndex).trim();
      if (name !== AUTH_COOKIE_NAME) continue;
      const rawValue = segment.slice(eqIndex + 1).trim();
      try {
        const decoded = decodeURIComponent(rawValue);
        const sanitized = sanitizeCandidateToken(decoded);
        if (sanitized) {
          return sanitized;
        }
      } catch {
        const sanitized = sanitizeCandidateToken(rawValue);
        if (sanitized) {
          return sanitized;
        }
      }
    }
  }

  return null;
}

export function extractRequestCandidates(req: Request): {
  candidates: TokenCandidateEntry[];
  diagnostics: Omit<
    AuthRequestDiagnostics,
    'tokenSource' | 'failureStage' | 'errorCode'
  >;
} {
  const authHeader = req.headers.authorization;
  const authorizationHeaderPresent =
    typeof authHeader === 'string' && authHeader.trim().length > 0;
  const bearerToken = extractBearerFromAuthorizationHeader(authHeader);

  const rawCookieHeader = req.headers.cookie;
  const parsedCookies = (req as Request & { cookies?: Record<string, unknown> })
    .cookies;
  const cookieHeaderPresent =
    (typeof rawCookieHeader === 'string' &&
      rawCookieHeader.trim().length > 0) ||
    Boolean(parsedCookies && Object.keys(parsedCookies).length > 0);
  const cookieToken = extractCookieToken(req);

  const candidates: TokenCandidateEntry[] = [];
  if (bearerToken) {
    candidates.push({
      token: bearerToken,
      source: 'authorization_bearer',
    });
  }
  if (cookieToken && cookieToken !== bearerToken) {
    candidates.push({
      token: cookieToken,
      source: 'cookie_rp_access_token',
    });
  }

  return {
    candidates,
    diagnostics: {
      authorizationHeaderPresent,
      bearerTokenExtracted: Boolean(bearerToken),
      cookieHeaderPresent,
      rpAccessTokenCookieExtracted: Boolean(cookieToken),
    },
  };
}

export function extractRequestToken(req: Request): string | null {
  const { candidates } = extractRequestCandidates(req);
  return candidates[0]?.token ?? null;
}

function logAuthDiagnostics(
  req: Request,
  diagnostics: AuthRequestDiagnostics
): void {
  req.authDiagnostics = diagnostics;
  if (diagnostics.failureStage !== 'NONE') {
    console.warn(
      '[AuthDiagnostics]',
      JSON.stringify({
        method: req.method,
        path: req.originalUrl,
        authorizationHeaderPresent: diagnostics.authorizationHeaderPresent,
        bearerTokenExtracted: diagnostics.bearerTokenExtracted,
        cookieHeaderPresent: diagnostics.cookieHeaderPresent,
        rp_access_tokenCookieExtracted:
          diagnostics.rpAccessTokenCookieExtracted,
        tokenSource: diagnostics.tokenSource,
        failureStage: diagnostics.failureStage,
        errorCode: diagnostics.errorCode,
      })
    );
  }
}

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const { candidates, diagnostics } = extractRequestCandidates(req);
  const primarySource: AuthTokenSource = candidates[0]?.source ?? 'none';

  try {
    if (candidates.length === 0) {
      const err = new AppError(
        401,
        'AUTHENTICATION_REQUIRED',
        'Authentication is required to access this resource.'
      );
      logAuthDiagnostics(req, {
        ...diagnostics,
        tokenSource: 'none',
        failureStage: 'TOKEN_EXTRACTION',
        errorCode: err.code,
      });
      throw err;
    }

    let verifiedPayload: JwtAccessPayload | null = null;
    let verifiedSource: AuthTokenSource = primarySource;
    let lastVerificationError: unknown = null;

    for (const candidate of candidates) {
      try {
        verifiedPayload = verifyAccessToken(candidate.token);
        verifiedSource = candidate.source;
        break;
      } catch (verifyErr) {
        lastVerificationError = verifyErr;
      }
    }

    if (!verifiedPayload) {
      const appErr =
        lastVerificationError instanceof AppError
          ? lastVerificationError
          : new AppError(
              401,
              'INVALID_OR_EXPIRED_TOKEN',
              'Authentication token is invalid or has expired.'
            );
      logAuthDiagnostics(req, {
        ...diagnostics,
        tokenSource: primarySource,
        failureStage: 'JWT_VERIFICATION',
        errorCode: appErr.code,
      });
      throw appErr;
    }

    const user = await userRepository.findById(verifiedPayload.sub);
    if (!user) {
      const err = new AppError(
        401,
        'INVALID_TOKEN_USER',
        'Authenticated account no longer exists.'
      );
      logAuthDiagnostics(req, {
        ...diagnostics,
        tokenSource: verifiedSource,
        failureStage: 'USER_LOOKUP',
        errorCode: err.code,
      });
      throw err;
    }

    if (user.status !== 'ACTIVE') {
      const err = new AppError(
        403,
        'ACCOUNT_INACTIVE',
        `Your account status is ${user.status}. Access denied.`
      );
      logAuthDiagnostics(req, {
        ...diagnostics,
        tokenSource: verifiedSource,
        failureStage: 'ACCOUNT_STATUS',
        errorCode: err.code,
      });
      throw err;
    }

    if ((user.tokenVersion ?? 0) !== (verifiedPayload.tokenVersion ?? 0)) {
      const err = new AppError(
        401,
        'TOKEN_REVOKED',
        'Authentication session has been invalidated. Please log in again.'
      );
      logAuthDiagnostics(req, {
        ...diagnostics,
        tokenSource: verifiedSource,
        failureStage: 'TOKEN_VERSION',
        errorCode: err.code,
      });
      throw err;
    }

    req.authUser = toPublicUserProfile(user);
    req.authTokenPayload = verifiedPayload;
    logAuthDiagnostics(req, {
      ...diagnostics,
      tokenSource: verifiedSource,
      failureStage: 'NONE',
      errorCode: null,
    });
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      const err = new AppError(
        401,
        'AUTHENTICATION_REQUIRED',
        'Authentication is required to access this resource.'
      );
      if (req.authDiagnostics) {
        logAuthDiagnostics(req, {
          ...req.authDiagnostics,
          failureStage: 'ROLE_AUTHORIZATION',
          errorCode: err.code,
        });
      }
      next(err);
      return;
    }

    if (!allowedRoles.includes(req.authUser.role)) {
      const err = new AppError(
        403,
        'FORBIDDEN_ROLE',
        `Access denied. Required role: ${allowedRoles.join(' or ')}.`
      );
      if (req.authDiagnostics) {
        logAuthDiagnostics(req, {
          ...req.authDiagnostics,
          failureStage: 'ROLE_AUTHORIZATION',
          errorCode: err.code,
        });
      }
      next(err);
      return;
    }

    next();
  };
}

/**
 * Enforces that a route can be accessed by an ADMIN or by a STAFF account
 * holding the specified view-only permission on a read-only (GET/HEAD) request.
 */
export function requireStaffPermission(requiredPermission: StaffPermission) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      const err = new AppError(
        401,
        'AUTHENTICATION_REQUIRED',
        'Authentication is required to access this resource.'
      );
      if (req.authDiagnostics) {
        logAuthDiagnostics(req, {
          ...req.authDiagnostics,
          failureStage: 'STAFF_PERMISSION',
          errorCode: err.code,
        });
      }
      next(err);
      return;
    }

    if (req.authUser.role === 'ADMIN') {
      next();
      return;
    }

    if (req.authUser.role !== 'STAFF') {
      const err = new AppError(
        403,
        'FORBIDDEN_ROLE',
        'Access denied. Required role: ADMIN or authorized STAFF.'
      );
      if (req.authDiagnostics) {
        logAuthDiagnostics(req, {
          ...req.authDiagnostics,
          failureStage: 'ROLE_AUTHORIZATION',
          errorCode: err.code,
        });
      }
      next(err);
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const err = new AppError(
        403,
        'FORBIDDEN_STAFF_WRITE',
        'Staff accounts have view-only access and cannot perform write operations.'
      );
      if (req.authDiagnostics) {
        logAuthDiagnostics(req, {
          ...req.authDiagnostics,
          failureStage: 'STAFF_PERMISSION',
          errorCode: err.code,
        });
      }
      next(err);
      return;
    }

    const permissions = req.authUser.staffPermissions ?? [];
    if (!permissions.includes(requiredPermission)) {
      const err = new AppError(
        403,
        'FORBIDDEN_STAFF_PERMISSION',
        `Access denied. Staff account does not hold the required permission: ${requiredPermission}.`
      );
      if (req.authDiagnostics) {
        logAuthDiagnostics(req, {
          ...req.authDiagnostics,
          failureStage: 'STAFF_PERMISSION',
          errorCode: err.code,
        });
      }
      next(err);
      return;
    }

    next();
  };
}
