export interface HealthResponse {
  status: string;
  service: string;
  phase: string;
  timestamp: string;
  application: {
    status: string;
    environment: string;
    uptimeSeconds: number;
  };
  database: {
    status: string;
    connected: boolean;
    transactionsRequired: boolean;
  };
}

export interface ApiClientConfig {
  appName: string;
  appEnv: string;
  apiBaseUrl: string;
}

const rawBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '/api').trim();
const normalizedBaseUrl = rawBaseUrl.replace(/\/+$/, '') || '/api';

export const apiConfig: ApiClientConfig = {
  appName: (import.meta.env.VITE_APP_NAME ?? 'Raithu Palu').trim(),
  appEnv: (import.meta.env.VITE_APP_ENV ?? import.meta.env.MODE ?? 'development').trim(),
  apiBaseUrl: normalizedBaseUrl,
};

export function buildApiUrl(endpoint: string): string {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${apiConfig.apiBaseUrl}${cleanEndpoint}`;
}

export async function fetchSystemHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(buildApiUrl('/health'), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Health check failed with HTTP status ${response.status}`);
  }

  return (await response.json()) as HealthResponse;
}
