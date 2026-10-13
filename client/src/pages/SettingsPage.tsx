import { useState } from 'react';
import { api, errorMessage } from '../api';
import { Button, Card, ConfirmDialog, Icon, Notice, PageTitle } from '../components/ui';
import { useDraft, useSession, useToast } from '../state';

export function SettingsPage() {
  const toast = useToast();
  const { status, signOut } = useSession();
  const { setDraft } = useDraft();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function deleteEverything() {
    setDeleting(true);
    try {
      const { deletedVersions } = await api.deleteAllData();
      setDraft(null);
      try {
        sessionStorage.clear();
      } catch {
        // nothing to clear
      }
      toast('success', `Deleted your master CV and ${deletedVersions} saved version${deletedVersions === 1 ? '' : 's'}.`);
      setConfirming(false);
    } catch (err) {
      toast('error', errorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageTitle title="Settings" />

      <Card>
        <h2 className="font-semibold text-slate-900">AI provider</h2>
        {!status ? (
          <p className="mt-1 text-sm text-slate-500">Checking…</p>
        ) : status.aiConfigured ? (
          <p className="mt-1 flex items-start gap-2 text-sm leading-relaxed text-slate-700">
            <Icon name="check" className="mt-0.5 h-4 w-4 text-emerald-700" />
            <span>
              Connected. Model: <strong>{status.aiModel}</strong>. Your master CV and the job description are sent to this provider when you tailor a CV or upload a document.
            </span>
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            <Notice kind="warn" title="Demo mode">
              No AI API key is configured on the server, so nothing is rewritten by AI. CVs are assembled from your master CV by keyword matching and are labelled as demo output.
            </Notice>
            <p className="text-sm leading-relaxed text-slate-600">
              To enable real tailoring, set <code className="rounded bg-slate-100 px-1 py-0.5 text-[13px]">AI_API_KEY</code> (and optionally{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5 text-[13px]">AI_BASE_URL</code> and <code className="rounded bg-slate-100 px-1 py-0.5 text-[13px]">AI_MODEL</code>) in the server
              environment, then restart it. The README explains each step.
            </p>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold text-slate-900">Storage</h2>
        {status && !status.dbPersistent ? (
          <div className="mt-2">
            <Notice kind="warn" title="Temporary storage">
              No MongoDB connection string is configured, so data is held in a temporary in-memory database and is lost when the server restarts. Set MONGODB_URI to keep your data.
            </Notice>
          </div>
        ) : (
          <p className="mt-1 text-sm leading-relaxed text-slate-700">
            Your master CV and saved versions are stored in the app's MongoDB database. Uploaded files are read once and never stored.
          </p>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold text-slate-900">Your data</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">Permanently delete your master CV and every saved CV version from the database.</p>
        <Button variant="danger" icon="trash" className="mt-3 w-full" onClick={() => setConfirming(true)}>
          Delete all my data
        </Button>
      </Card>

      <Button icon="logout" className="w-full" onClick={signOut}>
        Sign out
      </Button>

      <ConfirmDialog open={confirming} title="Delete all your data?" confirmLabel="Delete everything" danger busy={deleting} onCancel={() => setConfirming(false)} onConfirm={deleteEverything}>
        Your master CV and all saved CV versions will be permanently deleted. This cannot be undone.
      </ConfirmDialog>
    </div>
  );
}
