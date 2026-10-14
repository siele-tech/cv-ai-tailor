import { useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage } from '../api';
import { AdminPanel } from '../components/AdminPanel';
import { Button, Card, ConfirmDialog, Field, Icon, Notice, PageTitle } from '../components/ui';
import { useDraft, useSession, useToast } from '../state';
import type { Account } from '../types';

function PasswordForm() {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (next.length < 8) return toast('error', 'Choose a new password of at least 8 characters.');
    setBusy(true);
    try {
      await api.changePassword(current, next);
      setCurrent('');
      setNext('');
      toast('success', 'Password changed.');
    } catch (err) {
      toast('error', errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Field label="Current password" type="password" value={current} onChange={setCurrent} autoComplete="current-password" />
      <Field label="New password" type="password" value={next} onChange={setNext} autoComplete="new-password" hint="At least 8 characters." />
      <Button type="submit" className="w-full" loading={busy} disabled={!current || !next}>
        Change password
      </Button>
    </form>
  );
}

export function SettingsPage() {
  const toast = useToast();
  const { status, signOut } = useSession();
  const { setDraft } = useDraft();
  const [account, setAccount] = useState<Account | null>(null);
  const [confirming, setConfirming] = useState<'data' | 'account' | null>(null);
  const [deleting, setDeleting] = useState(false);
  const isOwner = status?.role === 'admin';

  useEffect(() => {
    api
      .account()
      .then((res) => setAccount(res.account))
      .catch(() => undefined);
  }, []);

  function clearLocal() {
    setDraft(null);
    try {
      sessionStorage.clear();
    } catch {
      // nothing to clear
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      if (confirming === 'account') {
        await api.deleteAccount();
        clearLocal();
        toast('success', 'Your account and CVs were deleted.');
        signOut();
        return;
      }
      const { deletedVersions } = await api.deleteAllData();
      clearLocal();
      toast('success', `Deleted your master CV and ${deletedVersions} saved version${deletedVersions === 1 ? '' : 's'}.`);
      setConfirming(null);
    } catch (err) {
      toast('error', errorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  const usage = status?.aiUsage;

  return (
    <div className="space-y-4">
      <PageTitle title="Settings" />

      <Card>
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-fuchsia-500 text-lg font-extrabold text-white">
            {(account?.name || (isOwner ? 'Owner' : '?')).charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="font-bold text-slate-900">{account?.name || (isOwner ? 'App owner' : 'Your account')}</p>
            <p className="truncate text-sm text-slate-500">{isOwner ? 'Owner · signs in with the owner password' : account?.email}</p>
          </div>
        </div>
        {usage && status?.aiConfigured && (
          <div className="mt-4">
            <div className="flex justify-between text-xs font-medium text-slate-600">
              <span>AI requests today</span>
              <span>{usage.limit ? `${usage.used} of ${usage.limit}` : `${usage.used} (no limit)`}</span>
            </div>
            {usage.limit > 0 && (
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-fuchsia-500" style={{ width: `${Math.min(100, (usage.used / usage.limit) * 100)}%` }} />
              </div>
            )}
          </div>
        )}
      </Card>

      {isOwner && <AdminPanel />}

      {!isOwner && status && (
        <Card>
          <h2 className="mb-3 font-bold text-slate-900">Password</h2>
          <PasswordForm />
        </Card>
      )}

      <Card>
        <h2 className="font-bold text-slate-900">AI provider</h2>
        {!status ? (
          <p className="mt-1 text-sm text-slate-500">Checking…</p>
        ) : status.aiConfigured ? (
          <p className="mt-1 flex items-start gap-2 text-sm leading-relaxed text-slate-700">
            <Icon name="check" className="mt-0.5 h-4 w-4 text-emerald-700" />
            <span>
              Connected. Model: <strong>{status.aiModel}</strong>. Your CV and the job description are sent to this provider when you tailor a CV or use the AI tools.
            </span>
          </p>
        ) : (
          <div className="mt-2">
            <Notice kind="warn" title="Demo mode">
              No AI API key is configured on the server, so nothing is rewritten by AI. CVs are assembled from your master CV by keyword matching and are labelled as demo output.
            </Notice>
          </div>
        )}
        {status && !status.dbPersistent && (
          <div className="mt-3">
            <Notice kind="warn" title="Temporary storage">
              No database is configured, so data is lost when the server restarts.
            </Notice>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="font-bold text-slate-900">Your data</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">Only you can see your CVs. Uploaded files are read once and never stored.</p>
        <Button variant="danger" icon="trash" className="mt-3 w-full" onClick={() => setConfirming('data')}>
          Delete all my CVs and master CV
        </Button>
        {!isOwner && (
          <Button variant="danger" className="mt-2 w-full" onClick={() => setConfirming('account')}>
            Delete my account
          </Button>
        )}
      </Card>

      <Button icon="logout" className="w-full" onClick={signOut}>
        Sign out
      </Button>

      <ConfirmDialog
        open={confirming !== null}
        title={confirming === 'account' ? 'Delete your account?' : 'Delete all your data?'}
        confirmLabel={confirming === 'account' ? 'Delete my account' : 'Delete everything'}
        danger
        busy={deleting}
        onCancel={() => setConfirming(null)}
        onConfirm={confirmDelete}
      >
        {confirming === 'account'
          ? 'Your account, master CV and every saved CV will be permanently deleted, and you will be signed out. This cannot be undone.'
          : 'Your master CV and all saved CV versions will be permanently deleted. This cannot be undone.'}
      </ConfirmDialog>
    </div>
  );
}
