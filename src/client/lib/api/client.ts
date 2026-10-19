/**
 * Same-origin API client. Always relative `/api` URLs — no API host, no CORS (see ARCHITECTURE.md).
 */

export type ApiSuccess<T> = { success: true; data: T; message?: string; timestamp: string };
export type ApiFailure = {
  success: false;
  error: { code: string; message: string; details?: Record<string, unknown> };
  timestamp: string;
};

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  return apiRequest<T>(path, { ...init, method: 'GET' });
}

export async function apiPost<T>(path: string, body: unknown = {}): Promise<T> {
  return apiRequest<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      // Marks same-origin XHR; the server additionally checks the Origin header on writes.
      ...(method !== 'GET' && method !== 'HEAD' ? { 'X-Requested-With': 'brt' } : {}),
      ...init.headers,
    },
  });

  let body: ApiSuccess<T> | ApiFailure | null = null;
  try {
    body = (await response.json()) as ApiSuccess<T> | ApiFailure;
  } catch {
    // Non-JSON response (e.g. a proxy error page).
  }

  if (!body) {
    throw new ApiClientError(response.status, 'INVALID_RESPONSE', `Unexpected response (${response.status})`);
  }
  if (!body.success) {
    throw new ApiClientError(response.status, body.error.code, body.error.message, body.error.details);
  }
  return body.data;
}

export async function apiPatch<T>(path: string, body: unknown = {}): Promise<T> {
  return apiRequest<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
}

export async function apiPut<T>(path: string, body: unknown = {}): Promise<T> {
  return apiRequest<T>(path, { method: 'PUT', body: JSON.stringify(body) });
}

export async function apiDelete<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: 'DELETE' });
}

/** multipart/form-data upload; the browser sets the boundary header. */
export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: 'POST',
    body: form,
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'X-Requested-With': 'brt' },
  });
  const body = (await response.json().catch(() => null)) as ApiSuccess<T> | ApiFailure | null;
  if (!body) throw new ApiClientError(response.status, 'INVALID_RESPONSE', `Unexpected response (${response.status})`);
  if (!body.success) throw new ApiClientError(response.status, body.error.code, body.error.message, body.error.details);
  return body.data;
}
