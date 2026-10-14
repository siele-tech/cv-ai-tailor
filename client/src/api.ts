import type {
  Account,
  AdminUser,
  Analysis,
  Application,
  Design,
  InterviewPrep,
  Invite,
  LetterTone,
  LinkedinProfile,
  SharedCv,
  CvContent,
  Dashboard,
  ExtractResult,
  Job,
  Layout,
  LayoutResult,
  Profile,
  RefineResult,
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

type VersionBody = Pick<TailorResult, 'job' | 'content' | 'analysis' | 'generatedBy' | 'aiModel'> & {
  coverLetter?: string;
  interviewPrep?: InterviewPrep | null;
};

// ---------- automatic retry when the AI provider is busy ----------

const BUSY = new Set(['ai_provider_error', 'ai_rate_limited', 'ai_timeout', 'ai_unreachable']);
const RETRY_DELAYS = [6, 15];
type RetryListener = (seconds: number | null) => void;
const retryListeners = new Set<RetryListener>();

/** Subscribe to "retrying in N seconds" notices (null when a retry starts or the call ends). */
export function onAiRetry(listener: RetryListener): () => void {
  retryListeners.add(listener);
  return () => retryListeners.delete(listener);
}

const wait = (seconds: number) =>
  new Promise<void>((resolve) => {
    let left = seconds;
    retryListeners.forEach((l) => l(left));
    const timer = setInterval(() => {
      left -= 1;
      retryListeners.forEach((l) => l(left > 0 ? left : null));
      if (left <= 0) {
        clearInterval(timer);
        resolve();
      }
    }, 1000);
  });

/**
 * Free AI tiers are often briefly overloaded. Instead of showing an error straight away,
 * wait and try again twice; the server has already tried its backup models by then.
 */
async function withAiRetry<T>(call: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (err) {
      const delay = RETRY_DELAYS[attempt];
      if (!(err instanceof ApiError) || !BUSY.has(err.code) || delay === undefined) throw err;
      await wait(delay);
    } finally {
      retryListeners.forEach((l) => l(null));
    }
  }
}

async function download(path: string, body: unknown, fallbackName: string, method = 'POST'): Promise<{ blob: Blob; filename: string }> {
  const response = await send(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  const header = response.headers.get('Content-Disposition') ?? '';
  const filename = /filename="([^"]+)"/.exec(header)?.[1] ?? fallbackName;
  return { blob: await response.blob(), filename };
}

export const api = {
  login: (email: string, password: string) => json<{ token: string }>('/auth/login', 'POST', { email, password }),
  register: (body: { code: string; name: string; email: string; password: string }) => json<{ token: string }>('/auth/register', 'POST', body),
  account: () => json<{ account: Account }>('/account'),
  changePassword: (currentPassword: string, newPassword: string) => json<{ ok: true }>('/account/password', 'POST', { currentPassword, newPassword }),
  deleteAccount: () => json<{ deletedVersions: number }>('/account', 'DELETE'),

  invites: () => json<{ invites: Invite[] }>('/admin/invites'),
  createInvite: (maxUses: number, note: string) => json<{ invite: Invite }>('/admin/invites', 'POST', { maxUses, note }),
  revokeInvite: (id: string) => json<void>(`/admin/invites/${encodeURIComponent(id)}`, 'DELETE'),
  users: () => json<{ users: AdminUser[]; dailyLimit: number }>('/admin/users'),
  setUserDisabled: (id: string, disabled: boolean) => json<{ ok: true }>(`/admin/users/${encodeURIComponent(id)}`, 'PATCH', { disabled }),
  deleteUser: (id: string) => json<void>(`/admin/users/${encodeURIComponent(id)}`, 'DELETE'),
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

  getLayout: () => json<{ layout: Layout }>('/layout'),
  saveLayout: (layout: Layout) => json<{ layout: Layout }>('/layout', 'PUT', { layout }),
  extractLayout: async (file: File): Promise<LayoutResult> => {
    const form = new FormData();
    form.append('file', file);
    return (await send('/layout/extract', { method: 'POST', body: form })).json() as Promise<LayoutResult>;
  },

  /** Put a CV in the manner of a sample CV: its structure and writing style, never its facts. */
  restyle: async (file: File, job: Job, content: CvContent, analysis: TailorResult['analysis']): Promise<RefineResult & { sectionsFound: number }> => {
    const form = new FormData();
    form.append('payload', JSON.stringify({ job, content, analysis }));
    form.append('file', file);
    return (await send('/tailor/restyle', { method: 'POST', body: form })).json() as Promise<RefineResult & { sectionsFound: number }>;
  },

  refine: (job: Job, content: CvContent, instruction: string) =>
    withAiRetry(() => json<RefineResult>('/tailor/refine', 'POST', { job, content, instruction })),

  tailor: (job: Job) => withAiRetry(() => json<TailorResult>('/tailor', 'POST', job)),
  regenerateSummary: (job: Job, currentSummary: string) =>
    withAiRetry(() => json<{ summary: string; generatedBy: 'ai' | 'demo'; warnings: string[] }>('/tailor/summary', 'POST', { job, currentSummary })),

  listVersions: () => json<{ versions: VersionSummary[] }>('/versions'),
  getVersion: (id: string) => json<{ version: Version }>(`/versions/${encodeURIComponent(id)}`),
  createVersion: (body: VersionBody) => json<{ version: Version }>('/versions', 'POST', body),
  updateVersion: (id: string, body: VersionBody) => json<{ version: Version }>(`/versions/${encodeURIComponent(id)}`, 'PUT', body),
  deleteVersion: (id: string) => json<void>(`/versions/${encodeURIComponent(id)}`, 'DELETE'),
  deleteAllData: () => json<{ deletedVersions: number }>('/data', 'DELETE'),

  coverLetter: (job: Job, content: CvContent, analysis: Analysis, tone: LetterTone) =>
    withAiRetry(() => json<{ letter: string; warnings: string[]; aiModel: string }>('/documents/cover-letter', 'POST', { job, content, analysis, tone })),
  interview: (job: Job, content: CvContent, analysis: Analysis) =>
    withAiRetry(() => json<{ prep: InterviewPrep; warnings: string[]; aiModel: string }>('/documents/interview', 'POST', { job, content, analysis })),
  linkedin: (target: string) => withAiRetry(() => json<{ linkedin: LinkedinProfile; warnings: string[] }>('/documents/linkedin', 'POST', { target })),
  onePage: (job: Job, content: CvContent, analysis: Analysis) =>
    withAiRetry(() => json<RefineResult & { pages: number }>('/documents/one-page', 'POST', { job, content, analysis })),
  pageCount: (content: CvContent) => json<{ pages: number }>('/pdf/info', 'POST', { content }),

  setApplication: (id: string, application: Application) =>
    json<{ application: Application }>(`/versions/${encodeURIComponent(id)}/application`, 'PATCH', application),
  share: (id: string) => json<{ token: string; enabled: boolean }>(`/versions/${encodeURIComponent(id)}/share`, 'POST'),
  unshare: (id: string) => json<{ enabled: boolean }>(`/versions/${encodeURIComponent(id)}/share`, 'DELETE'),
  shared: (token: string) => json<SharedCv>(`/shared/${encodeURIComponent(token)}`),
  sharedPdf: (token: string) => download(`/shared/${encodeURIComponent(token)}/pdf`, undefined, 'CV.pdf', 'GET'),

  docx: (content: CvContent, jobTitle: string, company: string) => download('/docx', { content, jobTitle, company }, 'Tailored_CV.docx'),
  letterPdf: (letter: string, contact: CvContent['contact'], jobTitle: string, company: string, design?: Design) =>
    download('/letter/pdf', { letter, contact, jobTitle, company, design }, 'Cover_Letter.pdf'),
  letterDocx: (letter: string, contact: CvContent['contact'], jobTitle: string, company: string) =>
    download('/letter/docx', { letter, contact, jobTitle, company }, 'Cover_Letter.docx'),

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
