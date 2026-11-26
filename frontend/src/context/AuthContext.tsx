import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import {
  type CustomerProfile,
  type RegisterCustomerPayload,
  type LoginCustomerPayload,
  type UpdateProfilePayload,
  registerCustomerApi,
  loginCustomerApi,
  logoutCustomerApi,
  fetchCustomerProfileApi,
  updateCustomerProfileApi,
} from '../lib/authApi';

const TOKEN_STORAGE_KEY = 'rp_customer_access_token';

interface AuthContextValue {
  user: CustomerProfile | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  register: (payload: RegisterCustomerPayload) => Promise<CustomerProfile>;
  login: (payload: LoginCustomerPayload) => Promise<CustomerProfile>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<CustomerProfile>;
  updateProfile: (payload: UpdateProfilePayload) => Promise<CustomerProfile>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CustomerProfile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(() => {
    try {
      return window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [isInitializing, setIsInitializing] = useState<boolean>(true);

  const persistToken = useCallback((token: string | null) => {
    setAccessToken(token);
    try {
      if (token) {
        window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
      } else {
        window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    } catch {
      // Ignore storage access errors in restricted browsers
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function restoreSession() {
      if (!accessToken) {
        if (active) setIsInitializing(false);
        return;
      }

      try {
        const profile = await fetchCustomerProfileApi(accessToken);
        if (active) {
          setUser(profile);
        }
      } catch {
        if (active) {
          setUser(null);
          persistToken(null);
        }
      } finally {
        if (active) {
          setIsInitializing(false);
        }
      }
    }

    void restoreSession();
    return () => {
      active = false;
    };
  }, [accessToken, persistToken]);

  const register = useCallback(
    async (payload: RegisterCustomerPayload): Promise<CustomerProfile> => {
      const response = await registerCustomerApi(payload);
      persistToken(response.data.accessToken);
      setUser(response.data.user);
      return response.data.user;
    },
    [persistToken]
  );

  const login = useCallback(
    async (payload: LoginCustomerPayload): Promise<CustomerProfile> => {
      const response = await loginCustomerApi(payload);
      persistToken(response.data.accessToken);
      setUser(response.data.user);
      return response.data.user;
    },
    [persistToken]
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      await logoutCustomerApi(accessToken);
    } finally {
      setUser(null);
      persistToken(null);
    }
  }, [accessToken, persistToken]);

  const refreshProfile = useCallback(async (): Promise<CustomerProfile> => {
    const profile = await fetchCustomerProfileApi(accessToken);
    setUser(profile);
    return profile;
  }, [accessToken]);

  const updateProfile = useCallback(
    async (payload: UpdateProfilePayload): Promise<CustomerProfile> => {
      const updated = await updateCustomerProfileApi(accessToken, payload);
      setUser(updated);
      return updated;
    },
    [accessToken]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isAuthenticated: Boolean(user && accessToken),
        isInitializing,
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
