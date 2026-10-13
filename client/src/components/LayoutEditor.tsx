import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { api, errorMessage } from '../api';
import { useSession, useToast } from '../state';
import { SECTION_NAMES, type Layout, type LayoutResult, type LayoutSection } from '../types';
import { Button, Icon, LoadingBlock, Notice, Progress } from './ui';

/** Reorder sections, rename their headings, and show or hide them. */
export function LayoutEditor({ value, onChange }: { value: Layout; onChange(layout: Layout): void }) {
  const update = (index: number, patch: Partial<LayoutSection>) =>
    onChange({ sections: value.sections.map((section, i) => (i === index ? { ...section, ...patch } : section)) });
  const move = (index: number, by: -1 | 1) => {
    const sections = [...value.sections];
    const [section] = sections.splice(index, 1);
    if (section) sections.splice(index + by, 0, section);
    onChange({ sections });
  };

  return (
    <ol className="space-y-2">
      {value.sections.map((section, index) => (
        <li key={section.key} className={`rounded-xl border p-2.5 ${section.hidden ? 'border-dashed border-slate-300 bg-slate-50' : 'border-slate-200 bg-white'}`}>
          <div className="flex items-center gap-1.5">
            <span className="w-5 shrink-0 text-center text-xs font-semibold text-slate-400">{index + 1}</span>
              <label className="min-w-0 flex-1 truncate text-[11px] font-medium tracking-wide text-slate-500 uppercase" htmlFor={`layout-${section.key}`}>
                {SECTION_NAMES[section.key]} heading
                {section.hidden ? ' (hidden)' : ''}
              </label>
            <div className="flex shrink-0">
              <button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move ${SECTION_NAMES[section.key]} up`} className="flex h-10 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-25">
                <Icon name="up" />
              </button>
              <button type="button" disabled={index === value.sections.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${SECTION_NAMES[section.key]} down`} className="flex h-10 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-25">
                <Icon name="up" className="h-5 w-5 rotate-180" />
              </button>
              <button
                type="button"
                onClick={() => update(index, { hidden: !section.hidden })}
                aria-pressed={!section.hidden}
                aria-label={`${section.hidden ? 'Show' : 'Hide'} ${SECTION_NAMES[section.key]}`}
                className={`flex h-10 w-9 items-center justify-center rounded-lg hover:bg-slate-100 ${section.hidden ? 'text-slate-300' : 'text-brand-700'}`}
              >
                <Icon name="eye" />
              </button>
            </div>
          </div>
          <div className="mt-1 pl-6">
              <input
                id={`layout-${section.key}`}
                value={section.title}
                maxLength={60}
                onChange={(e) => update(index, { title: e.target.value })}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-slate-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
              />
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * The owner's default CV structure: upload a CV or template whose layout you like, adjust
 * the detected order and headings, and save. Every newly tailored CV starts from it.
 */
export function StructureSettings() {
  const toast = useToast();
  const { status } = useSession();
  const fileInput = useRef<HTMLInputElement>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [savedJson, setSavedJson] = useState('');
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detected, setDetected] = useState<LayoutResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getLayout()
      .then((res) => {
        if (cancelled) return;
        setLayout(res.layout);
        setSavedJson(JSON.stringify(res.layout));
      })
      .catch((err) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, []);

  async function onFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setDetected(null);
    const maxMb = status?.maxUploadMb ?? 5;
    if (!/\.(pdf|docx)$/i.test(file.name)) return setError('Unsupported file type. Please choose a PDF or DOCX file.');
    if (file.size > maxMb * 1024 * 1024) return setError(`That file is larger than ${maxMb} MB.`);
    setReading(true);
    try {
      const result = await api.extractLayout(file);
      setDetected(result);
      if (result.found > 0) setLayout(result.layout);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setReading(false);
    }
  }

  async function save() {
    if (!layout) return;
    setSaving(true);
    try {
      const res = await api.saveLayout(layout);
      setLayout(res.layout);
      setSavedJson(JSON.stringify(res.layout));
      setDetected(null);
      toast('success', 'CV structure saved. New tailored CVs will use it.');
    } catch (err) {
      toast('error', errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (!layout) return error ? <Notice kind="error">{error}</Notice> : <LoadingBlock />;
  const dirty = JSON.stringify(layout) !== savedJson;

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-slate-600">
        Upload a CV or template laid out the way you like. Its section order and heading names are copied; its text, fonts and graphics are not. You can also arrange the sections by hand below.
      </p>
      <input ref={fileInput} type="file" className="sr-only" tabIndex={-1} aria-hidden="true" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={onFileChosen} />
      {reading ? (
        <Progress label="Reading the structure…" />
      ) : (
        <Button icon="upload" className="w-full" onClick={() => fileInput.current?.click()}>
          Upload a CV structure (PDF or DOCX)
        </Button>
      )}
      {error && <Notice kind="error">{error}</Notice>}
      {detected &&
        (detected.found > 0 ? (
          <Notice kind="info" title={`Found ${detected.found} section heading${detected.found === 1 ? '' : 's'}`}>
            The order and names below now follow that document. Sections it does not have were placed at the end; hide any you do not want. Nothing is saved until you press Save structure.
          </Notice>
        ) : (
          <Notice kind="warn" title="No section headings were recognised">
            The structure below was left unchanged. You can still arrange it by hand.
          </Notice>
        ))}
      <LayoutEditor value={layout} onChange={setLayout} />
      <Button variant="primary" icon="save" className="w-full" onClick={save} loading={saving} disabled={!dirty}>
        {dirty ? 'Save structure' : 'Structure saved'}
      </Button>
    </div>
  );
}
