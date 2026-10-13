import type {
  CvContent,
  Dashboard,
  ExtractResult,
  Job,
  Profile,
  Status,
  TailorResult,
  Version,
  VersionSummary,
} from './types';

// Empty by default: the API is served from the same origin as the app. Set VITE_API_BASE_URL
// at build time only when the frontend and backend are deployed to different origins.
const BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
const TOKEN_KEY = 'cvt_token';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: string[] = [],
  ) {
    super(message);
  }
}

let onUnauthorized: (() => void) | undefined;
export const setUnauthorizedHandler = (handler: () => void) => {
  onUnauthorized = handler;
};

export const getToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};
export const setToken = (token: string | null) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage can be unavailable (private mode); the session then lasts until the tab closes.
  }
};

async function send(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (typeof init.body === 'string') headers.set('Content-Type', 'application/json');

  let response: Response;
  try {
    response = await fetch(`${BASE}/api${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, 'network', 'Could not reach the server. Check your connection and try again. On free hosting the first request after a quiet period can take up to a minute.');
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: { code?: string; message?: string; details?: string[] } }
      | null;
    const error = new ApiError(
      response.status,
      body?.error?.code ?? 'error',
      body?.error?.message ?? `The request failed (HTTP ${response.status}).`,
      body?.error?.details ?? [],
    );
    if (response.status === 401 && path !== '/auth/login') onUnauthorized?.();
    throw error;
  }
  return response;
}

async function json<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await send(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  return (response.status === 204 ? undefined : await response.json()) as T;
}

type VersionBody = Pick<TailorResult, 'job' | 'content' | 'analysis' | 'generatedBy' | 'aiModel'>;

export const api = {
  login: (password: string) => json<{ token: string }>('/auth/login', 'POST', { password }),
  status: () => json<Status>('/status'),
  dashboard: () => json<Dashboard>('/dashboard'),

  getProfile: () => json<{ profile: Profile | null; updatedAt: string | null }>('/profile'),
  saveProfile: (profile: Profile) => json<{ profile: Profile; updatedAt: string }>('/profile', 'PUT', profile),
  sampleProfile: () => json<{ profile: Profile }>('/profile/sample'),
  extractProfile: async (file: File): Promise<ExtractResult> => {
    const form = new FormData();
    form.append('file', file);
    return (await send('/profile/extract', { method: 'POST', body: form })).json() as Promise<ExtractResult>;
  },

  tailor: (job: Job) => json<TailorResult>('/tailor', 'POST', job),
  regenerateSummary: (job: Job, currentSummary: string) =>
    json<{ summary: string; generatedBy: 'ai' | 'demo'; warnings: string[] }>('/tailor/summary', 'POST', { job, currentSummary }),

  listVersions: () => json<{ versions: VersionSummary[] }>('/versions'),
  getVersion: (id: string) => json<{ version: Version }>(`/versions/${encodeURIComponent(id)}`),
  createVersion: (body: VersionBody) => json<{ version: Version }>('/versions', 'POST', body),
  updateVersion: (id: string, body: VersionBody) => json<{ version: Version }>(`/versions/${encodeURIComponent(id)}`, 'PUT', body),
  deleteVersion: (id: string) => json<void>(`/versions/${encodeURIComponent(id)}`, 'DELETE'),
  deleteAllData: () => json<{ deletedVersions: number }>('/data', 'DELETE'),

  /** Renders the given content to PDF on the server and returns it with its suggested filename. */
  pdf: async (content: CvContent, jobTitle: string, company: string): Promise<{ blob: Blob; filename: string }> => {
    const response = await send('/pdf', { method: 'POST', body: JSON.stringify({ content, jobTitle, company }) });
    const header = response.headers.get('Content-Disposition') ?? '';
    const filename = /filename="([^"]+)"/.exec(header)?.[1] ?? 'Tailored_CV.pdf';
    return { blob: await response.blob(), filename };
  },
};

/** Hand a blob to the browser's download manager (works in Chrome on Android). */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const errorMessage = (err: unknown): string => {
  if (err instanceof ApiError) return err.details.length ? `${err.message} ${err.details.join('; ')}` : err.message;
  return 'Something went wrong. Please try again.';
};
