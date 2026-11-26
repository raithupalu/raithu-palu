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
  logoutCustomerApi,
  fetchCustomerProfileApi,
  updateCustomerProfileApi,
} from '../lib/authApi';

const TOKEN_STORAGE_KEY = 'rp_customer_access_token';

export function readStoredToken(): string | null {
  try {
    const localToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (isPlausibleJwt(localToken)) {
      return localToken.trim();
    }
    if (localToken !== null) {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }

    const sessionToken = window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (isPlausibleJwt(sessionToken)) {
      const clean = sessionToken.trim();
      window.localStorage.setItem(TOKEN_STORAGE_KEY, clean);
      return clean;
    }
    if (sessionToken !== null) {
      window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    }

    return null;
  } catch {
    return null;
  }
}

export function writeStoredToken(token: string | null): void {
  try {
    if (isPlausibleJwt(token)) {
      const clean = token.trim();
      window.localStorage.setItem(TOKEN_STORAGE_KEY, clean);
      window.sessionStorage.setItem(TOKEN_STORAGE_KEY, clean);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage access errors in restricted browsers
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
  const hasRestoredOnMount = useRef<boolean>(false);

  const persistToken = useCallback((token: string | null) => {
    const validToken = isPlausibleJwt(token) ? token.trim() : null;
    setAccessToken(validToken);
    writeStoredToken(validToken);
  }, []);

  const clearSessionError = useCallback(() => {
    setSessionError(null);
  }, []);

  useEffect(() => {
    if (hasRestoredOnMount.current) {
      return;
    }
    hasRestoredOnMount.current = true;

    let active = true;
    async function restoreInitialSession() {
      const initialToken = readStoredToken();
      setIsInitializing(true);
      setIsLoading(true);

      try {
        // Attempt profile fetch using stored Bearer token and/or httpOnly cookie
        const profile = await fetchCustomerProfileApi(initialToken);
        if (active) {
          setUser(profile);
          setSessionError(null);
        }
      } catch (err) {
        if (!active) return;

        if (isDefinitiveAuthRejection(err)) {
          setUser(null);
          if (initialToken) {
            persistToken(null);
          }
          setSessionError(null);
        } else {
          // Do not treat transient network/server errors as a logout when a token exists
          if (initialToken) {
            setSessionError(
              err instanceof Error
                ? err.message
                : 'Unable to verify customer session at this moment.'
            );
          }
        }
      } finally {
        if (active) {
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

  const logout = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const currentToken = accessToken ?? readStoredToken();
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
    const currentToken = accessToken ?? readStoredToken();
    setIsLoading(true);
    setSessionError(null);
    try {
      const profile = await fetchCustomerProfileApi(currentToken);
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
            : 'Unable to refresh customer profile.'
        );
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, persistToken]);

  const updateProfile = useCallback(
    async (payload: UpdateProfilePayload): Promise<CustomerProfile> => {
      const currentToken = accessToken ?? readStoredToken();
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
