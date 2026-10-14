import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api';
import { defaultLayout, type Draft, type Status } from './types';

// ---------- toasts ----------

type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

const ToastContext = createContext<(kind: ToastKind, text: string) => void>(() => undefined);
export const useToast = () => useContext(ToastContext);

const TOAST_STYLE: Record<ToastKind, string> = {
  success: 'bg-emerald-700',
  error: 'bg-red-700',
  info: 'bg-slate-800',
};

function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((kind: ToastKind, text: string) => {
    const id = nextId.current++;
    setToasts((list) => [...list.slice(-2), { id, kind, text }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), kind === 'error' ? 8000 : 4000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-16 z-50 mx-auto flex max-w-2xl flex-col gap-2 px-4" aria-live="polite">
        {toasts.map((toast) => (
          <button
            key={toast.id}
            type="button"
            role={toast.kind === 'error' ? 'alert' : 'status'}
            onClick={() => setToasts((list) => list.filter((t) => t.id !== toast.id))}
            className={`pointer-events-auto rounded-xl px-4 py-3 text-left text-sm font-medium text-white shadow-lg ${TOAST_STYLE[toast.kind]}`}
          >
            {toast.text}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ---------- session ----------

interface Session {
  signedIn: boolean;
  status: Status | null;
  /** email is empty for the owner, who signs in with the owner password alone */
  signIn(email: string, password: string): Promise<void>;
  join(details: { code: string; name: string; email: string; password: string }): Promise<void>;
  refreshStatus(): void;
  signOut(): void;
}

const SessionContext = createContext<Session | null>(null);
export function useSession(): Session {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside AppProviders');
  return value;
}

// ---------- the CV being edited ----------

const DRAFT_KEY = 'cvt_draft';

interface DraftStore {
  draft: Draft | null;
  setDraft(draft: Draft | null): void;
  /** Apply an edit to the open CV and mark it as having unsaved changes. */
  editDraft(change: (draft: Draft) => Draft): void;
}

const DraftContext = createContext<DraftStore | null>(null);
export function useDraft(): DraftStore {
  const value = useContext(DraftContext);
  if (!value) throw new Error('useDraft must be used inside AppProviders');
  return value;
}

function readDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Draft;
    // Drafts stored before CV structures existed have no layout.
    if (!draft.content.layout?.sections?.length) draft.content.layout = defaultLayout();
    return draft;
  } catch {
    return null;
  }
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState(() => Boolean(getToken()));
  const [status, setStatus] = useState<Status | null>(null);
  const [draft, setDraftState] = useState<Draft | null>(() => (getToken() ? readDraft() : null));

  // Kept in sessionStorage so a refresh or an accidental back-swipe does not lose a generated
  // CV. It is cleared when the tab closes and on sign-out.
  useEffect(() => {
    try {
      if (draft) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      else sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      // Storage full or unavailable: the draft simply lives in memory.
    }
  }, [draft]);

  const signOut = useCallback(() => {
    setToken(null);
    setSignedIn(false);
    setStatus(null);
    setDraftState(null);
  }, []);

  useEffect(() => setUnauthorizedHandler(signOut), [signOut]);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    api
      .status()
      .then((s) => !cancelled && setStatus(s))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const session = useMemo<Session>(
    () => ({
      signedIn,
      status,
      signIn: async (email, password) => {
        const { token } = await api.login(email, password);
        setToken(token);
        setSignedIn(true);
      },
      join: async (details) => {
        const { token } = await api.register(details);
        setToken(token);
        setSignedIn(true);
      },
      signOut,
      refreshStatus: () => {
        api.status().then(setStatus).catch(() => undefined);
      },
    }),
    [signedIn, status, signOut],
  );

  const draftStore = useMemo<DraftStore>(
    () => ({
      draft,
      setDraft: setDraftState,
      editDraft: (change) => setDraftState((current) => (current ? { ...change(current), dirty: true } : current)),
    }),
    [draft],
  );

  return (
    <ToastProvider>
      <SessionContext.Provider value={session}>
        <DraftContext.Provider value={draftStore}>{children}</DraftContext.Provider>
      </SessionContext.Provider>
    </ToastProvider>
  );
}
