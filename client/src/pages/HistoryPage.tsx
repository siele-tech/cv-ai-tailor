import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage, saveBlob } from '../api';
import { Button, Card, ConfirmDialog, EmptyState, LoadingBlock, Notice, PageTitle, formatDate } from '../components/ui';
import { useDraft, useToast } from '../state';
import { STATUS_OPTIONS, statusOption, type ApplicationStatus, type VersionSummary } from '../types';

export function HistoryPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { draft, setDraft } = useDraft();

  const [versions, setVersions] = useState<VersionSummary[] | null>(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<VersionSummary | null>(null);
  const [filter, setFilter] = useState<ApplicationStatus | 'all'>('all');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .listVersions()
      .then((res) => !cancelled && setVersions(res.versions))
      .catch((err) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, []);

  async function download(item: VersionSummary) {
    setDownloading(item.id);
    try {
      // If this version is open with unsaved edits, the saved copy is what gets downloaded here.
      const { version } = await api.getVersion(item.id);
      const { blob, filename } = await api.pdf(version.content, version.job.title, version.job.company);
      saveBlob(blob, filename);
      toast('success', `Downloaded ${filename}`);
    } catch (err) {
      toast('error', errorMessage(err));
    } finally {
      setDownloading(null);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.deleteVersion(toDelete.id);
      setVersions((list) => list?.filter((v) => v.id !== toDelete.id) ?? null);
      if (draft?.id === toDelete.id) setDraft(null);
      toast('success', 'CV version deleted.');
      setToDelete(null);
    } catch (err) {
      toast('error', errorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  if (error) return <Notice kind="error" title="Could not load your history">{error}</Notice>;
  if (!versions) return <LoadingBlock />;

  return (
    <div className="space-y-4">
      <PageTitle title="Applications" subtitle="Every CV you saved, and where each application stands." />

      {versions.length > 0 && (
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Filter by status">
          {[{ id: 'all' as const, label: 'All', tone: '' }, ...STATUS_OPTIONS].map((option) => {
            const count = option.id === 'all' ? versions.length : versions.filter((v) => (v.status ?? 'not_applied') === option.id).length;
            if (option.id !== 'all' && count === 0) return null;
            return (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={filter === option.id}
                onClick={() => setFilter(option.id)}
                className={`min-h-10 shrink-0 rounded-full px-3.5 text-sm font-semibold whitespace-nowrap transition ${filter === option.id ? 'bg-gradient-to-r from-brand-600 to-violet-600 text-white shadow' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}
              >
                {option.label} <span className="opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {versions.length === 0 ? (
        <EmptyState
          icon="clock"
          title="No saved CVs yet"
          action={
            <Button variant="primary" className="w-full" onClick={() => navigate('/tailor')}>
              Create Tailored CV
            </Button>
          }
        >
          After you tailor a CV, press “Save version” to keep it here with the job title and company.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {versions.filter((v) => filter === 'all' || (v.status ?? 'not_applied') === filter).map((item) => (
            <li key={item.id}>
              <Card>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">{item.jobTitle}</p>
                    <p className="text-sm text-slate-600">{item.company || 'Company not specified'}</p>
                  </div>
                  {typeof item.score === 'number' && (
                    <span className={`shrink-0 rounded-xl px-2.5 py-1.5 text-sm font-extrabold ${item.score >= 70 ? 'bg-emerald-100 text-emerald-700' : item.score >= 45 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-700'}`}>
                      {item.score}%
                    </span>
                  )}
                </div>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${statusOption(item.status).tone}`}>{statusOption(item.status).label}</span>
                  <span>{item.appliedAt ? `Applied ${formatDate(item.appliedAt)}` : `Created ${formatDate(item.createdAt)}`}</span>
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-800">{item.emphasis}</span>
                  {item.generatedBy === 'demo' && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900">Demo</span>}
                </p>
                <div className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2">
                  <Button size="sm" icon="edit" onClick={() => navigate(`/cv/${item.id}`)}>
                    View / edit
                  </Button>
                  <Button size="sm" icon="download" loading={downloading === item.id} disabled={downloading !== null} onClick={() => download(item)}>
                    Download
                  </Button>
                  <Button size="sm" variant="danger" icon="trash" aria-label={`Delete ${item.jobTitle}`} onClick={() => setToDelete(item)} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog open={toDelete !== null} title="Delete this CV version?" confirmLabel="Delete" danger busy={deleting} onCancel={() => setToDelete(null)} onConfirm={confirmDelete}>
        “{toDelete?.jobTitle}”{toDelete?.company ? ` at ${toDelete.company}` : ''} will be permanently deleted. This cannot be undone.
      </ConfirmDialog>
    </div>
  );
}
