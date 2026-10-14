import { useEffect, useState } from 'react';
import { api, errorMessage, saveBlob } from '../api';
import { CvPreview } from '../components/CvPreview';
import { Button, LoadingBlock, Notice, formatDate } from '../components/ui';
import type { SharedCv } from '../types';

/** Public, read-only view of a CV someone shared by link. No sign-in. */
export function SharedPage({ token }: { token: string }) {
  const [cv, setCv] = useState<SharedCv | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .shared(token)
      .then(setCv)
      .catch((err) => setError(errorMessage(err)));
  }, [token]);

  async function download() {
    setBusy(true);
    try {
      const { blob, filename } = await api.sharedPdf(token);
      saveBlob(blob, filename);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 via-violet-600 to-fuchsia-500 text-xs font-extrabold text-white">CV</span>
        <p className="text-sm font-semibold text-slate-600">Shared with CV Tailor AI</p>
      </div>
      {error ? (
        <Notice kind="error" title="This CV is not available">
          {error}
        </Notice>
      ) : !cv ? (
        <LoadingBlock label="Opening CV…" />
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">Updated {formatDate(cv.updatedAt)}</p>
            <Button variant="primary" icon="download" size="sm" onClick={download} loading={busy}>
              Download PDF
            </Button>
          </div>
          <CvPreview content={cv.content} />
        </div>
      )}
    </main>
  );
}
