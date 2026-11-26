import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import {
  type CustomerProfile,
  type RegisterCustomerPayload,
  type LoginCustomerPayload,
  type UpdateProfilePayload,
  ApiRequestError,
  isPlausibleJwt,
  registerCustomerApi,
  loginCustomerApi,
  loginAdminApi,
  logoutCustomerApi,
  fetchSessionUserApi,
  fetchCustomerProfileApi,
  updateCustomerProfileApi,
} from '../lib/authApi';

const TOKEN_STORAGE_KEY = 'rp_customer_access_token';

// Synchronous in-memory fallback so token is never lost if browser blocks third-party storage in iframes
let inMemoryToken: string | null = null;

export function readStoredToken(): string | null {
  if (isPlausibleJwt(inMemoryToken)) {
    return inMemoryToken;
  }

  try {
    const localToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (isPlausibleJwt(localToken)) {
      const clean = localToken.trim();
      inMemoryToken = clean;
      return clean;
    }
    if (localToken !== null) {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // localStorage may be blocked in cross-origin preview iframes
  }

  try {
    const sessionToken = window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (isPlausibleJwt(sessionToken)) {
      const clean = sessionToken.trim();
      inMemoryToken = clean;
      return clean;
    }
    if (sessionToken !== null) {
      window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // sessionStorage may be blocked in restricted browsers
  }

  return null;
}

export function writeStoredToken(token: string | null): void {
  const validToken = isPlausibleJwt(token) ? token.trim() : null;
  inMemoryToken = validToken;

  try {
    if (validToken) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, validToken);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore localStorage access errors in restricted browsers
  }

  try {
    if (validToken) {
      window.sessionStorage.setItem(TOKEN_STORAGE_KEY, validToken);
    } else {
      window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore sessionStorage access errors in restricted browsers
  }
}

function isDefinitiveAuthRejection(err: unknown): boolean {
  return (
    err instanceof ApiRequestError &&
    (err.statusCode === 401 || err.statusCode === 403)
  );
}

interface AuthContextValue {
  user: CustomerProfile | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  isLoading: boolean;
  sessionError: string | null;
  clearSessionError: () => void;
  register: (payload: RegisterCustomerPayload) => Promise<CustomerProfile>;
  login: (payload: LoginCustomerPayload) => Promise<CustomerProfile>;
  loginAdmin: (payload: LoginCustomerPayload) => Promise<CustomerProfile>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<CustomerProfile>;
  updateProfile: (payload: UpdateProfilePayload) => Promise<CustomerProfile>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CustomerProfile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(() =>
    readStoredToken()
  );
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const tokenRef = useRef<string | null>(accessToken);
  const sessionEpochRef = useRef<number>(0);

  const persistToken = useCallback((token: string | null) => {
    const validToken = isPlausibleJwt(token) ? token.trim() : null;
    tokenRef.current = validToken;
    writeStoredToken(validToken);
    setAccessToken(validToken);
  }, []);

  const clearSessionError = useCallback(() => {
    setSessionError(null);
  }, []);

  useEffect(() => {
    let active = true;
    const effectEpoch = sessionEpochRef.current;

    async function restoreInitialSession() {
      const initialToken = tokenRef.current ?? readStoredToken();

      // Fresh application load without a stored token: do not fire an unauthenticated session request
      if (!initialToken) {
        if (active && sessionEpochRef.current === effectEpoch) {
          setUser(null);
          setIsInitializing(false);
          setIsLoading(false);
        }
        return;
      }

      setIsInitializing(true);
      setIsLoading(true);

      try {
        const profile = await fetchSessionUserApi(initialToken);
        if (active && sessionEpochRef.current === effectEpoch) {
          setUser(profile);
          setSessionError(null);
        }
      } catch (err) {
        if (!active || sessionEpochRef.current !== effectEpoch) {
          return;
        }

        if (isDefinitiveAuthRejection(err)) {
          setUser(null);
          persistToken(null);
          setSessionError(null);
        } else {
          setSessionError(
            err instanceof Error
              ? err.message
              : 'Unable to verify session at this moment.'
          );
        }
      } finally {
        if (active && sessionEpochRef.current === effectEpoch) {
          setIsInitializing(false);
          setIsLoading(false);
        }
      }
    }

    void restoreInitialSession();
    return () => {
      active = false;
    };
  }, [persistToken]);

  const register = useCallback(
    async (payload: RegisterCustomerPayload): Promise<CustomerProfile> => {
      sessionEpochRef.current += 1;
      setIsLoading(true);
      setSessionError(null);
      try {
        const response = await registerCustomerApi(payload);
        persistToken(response.data.accessToken);
        setUser(response.data.user);
        setIsInitializing(false);
        return response.data.user;
      } finally {
        setIsLoading(false);
      }
    },
    [persistToken]
  );

  const login = useCallback(
    async (payload: LoginCustomerPayload): Promise<CustomerProfile> => {
      sessionEpochRef.current += 1;
      setIsLoading(true);
      setSessionError(null);
      try {
        const response = await loginCustomerApi(payload);
        persistToken(response.data.accessToken);
        setUser(response.data.user);
        setIsInitializing(false);
        return response.data.user;
      } finally {
        setIsLoading(false);
      }
    },
    [persistToken]
  );

  const loginAdmin = useCallback(
    async (payload: LoginCustomerPayload): Promise<CustomerProfile> => {
      sessionEpochRef.current += 1;
      setIsLoading(true);
      setSessionError(null);
      try {
        const response = await loginAdminApi(payload);
        persistToken(response.data.accessToken);
        setUser(response.data.user);
        setIsInitializing(false);
        return response.data.user;
      } finally {
        setIsLoading(false);
      }
    },
    [persistToken]
  );

  const logout = useCallback(async (): Promise<void> => {
    sessionEpochRef.current += 1;
    setIsLoading(true);
    const currentToken = tokenRef.current ?? accessToken ?? readStoredToken();
    try {
      await logoutCustomerApi(currentToken);
    } catch {
      // Even if server token already expired, complete local cleanup
    } finally {
      setUser(null);
      persistToken(null);
      setSessionError(null);
      setIsLoading(false);
    }
  }, [accessToken, persistToken]);

  const refreshProfile = useCallback(async (): Promise<CustomerProfile> => {
    const currentToken = tokenRef.current ?? accessToken ?? readStoredToken();
    setIsLoading(true);
    setSessionError(null);
    try {
      const profile =
        user?.role === 'CUSTOMER'
          ? await fetchCustomerProfileApi(currentToken)
          : await fetchSessionUserApi(currentToken);
      setUser(profile);
      return profile;
    } catch (err) {
      if (isDefinitiveAuthRejection(err)) {
        setUser(null);
        persistToken(null);
        setSessionError(
          err instanceof Error
            ? err.message
            : 'Your session has expired. Please sign in again.'
        );
      } else {
        setSessionError(
          err instanceof Error
            ? err.message
            : 'Unable to refresh user profile.'
        );
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, persistToken, user?.role]);

  const updateProfile = useCallback(
    async (payload: UpdateProfilePayload): Promise<CustomerProfile> => {
      const currentToken = tokenRef.current ?? accessToken ?? readStoredToken();
      const updated = await updateCustomerProfileApi(currentToken, payload);
      setUser(updated);
      setSessionError(null);
      return updated;
    },
    [accessToken]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isAuthenticated: Boolean(user && user.status === 'ACTIVE'),
        isInitializing,
        isLoading,
        sessionError,
        clearSessionError,
        register,
        login,
        loginAdmin,
        logout,
        refreshProfile,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
