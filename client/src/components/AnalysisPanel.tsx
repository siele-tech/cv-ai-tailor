import { useState, type ReactNode } from 'react';
import type { Analysis, Generator, Requirement } from '../types';
import { ScoreRing } from './ScoreRing';
import { Button, Card, Chips, Icon, Notice } from './ui';

function Block({ title, empty, children }: { title: string; empty: string; children: ReactNode | null }) {
  return (
    <Card>
      <h3 className="mb-2.5 text-sm font-bold text-slate-900">{title}</h3>
      {children ?? <p className="text-sm text-slate-500">{empty}</p>}
    </Card>
  );
}

const bullets = (items: string[]) =>
  items.length ? (
    <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-700">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  ) : null;

const STATUS = {
  met: { label: 'Met', badge: 'bg-emerald-100 text-emerald-700', icon: 'check' as const },
  partial: { label: 'Partly met', badge: 'bg-amber-100 text-amber-800', icon: 'alert' as const },
  missing: { label: 'Not shown', badge: 'bg-rose-100 text-rose-700', icon: 'plus' as const },
};

function RequirementRow({ req }: { req: Requirement }) {
  const s = STATUS[req.status];
  return (
    <li className="flex gap-3 py-2.5">
      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${s.badge}`}>
        <Icon name={s.icon} className={`h-4 w-4 ${req.status === 'missing' ? 'rotate-45' : ''}`} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">{req.requirement}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span className={`rounded-full px-2 py-0.5 font-semibold ${s.badge}`}>{s.label}</span>
          <span>{req.importance === 'essential' ? 'Essential' : 'Nice to have'}</span>
        </p>
        {req.evidence && <p className="mt-1 text-xs leading-relaxed text-slate-600">{req.evidence}</p>}
      </div>
    </li>
  );
}

/**
 * The truthful way to a higher score: the user confirms which requirements they really meet
 * and says where, and the AI adds it to the CV.
 */
function BoostForm({ gaps, onBoost, busy }: { gaps: Requirement[]; onBoost(instruction: string): void; busy: boolean }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const filled = gaps.filter((g) => open[g.requirement] && (answers[g.requirement] ?? '').trim().length >= 3);

  function submit() {
    const lines = filled.map((g) => `- ${g.requirement}: ${answers[g.requirement]!.trim()}`);
    onBoost(`These are true facts about my experience. Add them to my CV where they fit best, in natural wording, without exaggerating:\n${lines.join('\n')}`);
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 via-violet-600 to-fuchsia-600 p-[1.5px] shadow-lg shadow-brand-600/15">
      <div className="rounded-[15px] bg-white p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-fuchsia-500 text-white">
            <Icon name="up" className="h-5 w-5" />
          </span>
          <h3 className="font-bold text-slate-900">Raise your score</h3>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Done any of these, even at school, in a project, a volunteer role or a part-time job? Tap it and say where. The AI adds it to this CV and re-scores. Only add what is true: you may be asked about it in an interview.
        </p>
        <ul className="mt-3 space-y-2">
          {gaps.map((gap) => {
            const isOpen = Boolean(open[gap.requirement]);
            return (
              <li key={gap.requirement} className={`rounded-xl border p-2.5 transition-colors ${isOpen ? 'border-brand-300 bg-brand-50/60' : 'border-slate-200'}`}>
                <button type="button" onClick={() => setOpen({ ...open, [gap.requirement]: !isOpen })} aria-expanded={isOpen} className="flex min-h-9 w-full items-center gap-2.5 text-left">
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${isOpen ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300'}`}>
                    {isOpen && <Icon name="check" className="h-4 w-4" />}
                  </span>
                  <span className="flex-1 text-sm font-medium text-slate-800">
                    {gap.requirement}
                    {gap.status === 'partial' && <span className="ml-1.5 text-xs font-normal text-amber-700">(partly shown)</span>}
                  </span>
                </button>
                {isOpen && (
                  <textarea
                    rows={2}
                    autoFocus
                    value={answers[gap.requirement] ?? ''}
                    onChange={(e) => setAnswers({ ...answers, [gap.requirement]: e.target.value })}
                    maxLength={500}
                    placeholder="Where and how? e.g. At my internship I…"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
                  />
                )}
              </li>
            );
          })}
        </ul>
        <Button variant="primary" icon="sparkles" className="mt-3 w-full" disabled={filled.length === 0 || busy} loading={busy} onClick={submit}>
          {filled.length ? `Add ${filled.length} to my CV and re-score` : 'Tick what you have done and say where'}
        </Button>
      </div>
    </div>
  );
}

interface Props {
  analysis: Analysis;
  generatedBy: Generator;
  /** When given, gaps can be filled in by telling the AI about real experience. */
  onBoost?(instruction: string): void;
  boosting?: boolean;
}

export function AnalysisPanel({ analysis, generatedBy, onBoost, boosting = false }: Props) {
  const requirements = analysis.requirements ?? [];
  const met = requirements.filter((r) => r.status === 'met');
  const partial = requirements.filter((r) => r.status === 'partial');
  const missing = requirements.filter((r) => r.status === 'missing');
  const ordered = [...missing.filter((r) => r.importance === 'essential'), ...partial, ...missing.filter((r) => r.importance !== 'essential'), ...met];
  const gaps = [...missing, ...partial];

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex items-center gap-4">
          <ScoreRing score={analysis.score} />
          <div className="min-w-0">
            <h3 className="font-bold text-slate-900">Job match</h3>
            {requirements.length > 0 ? (
              <p className="mt-1 text-sm text-slate-600">
                <span className="font-semibold text-emerald-700">{met.length} met</span>
                {' · '}
                <span className="font-semibold text-amber-700">{partial.length} partly</span>
                {' · '}
                <span className="font-semibold text-rose-700">{missing.length} not shown</span>
                <span className="block text-xs text-slate-500">of {requirements.length} requirements in the advert</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-600">{generatedBy === 'ai' ? 'AI estimate' : 'Keyword-overlap estimate (demo mode)'}</p>
            )}
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          An estimate of how well your real background fits the advert. Essential requirements count three times as much as nice-to-haves, and related experience earns half credit. It is not an ATS result or a guarantee of an interview.
        </p>
      </Card>

      {onBoost && gaps.length > 0 && <BoostForm gaps={gaps} onBoost={onBoost} busy={boosting} />}

      {analysis.flags.length > 0 && (
        <Notice kind="warn" title="Check before sending">
          <ul className="list-disc space-y-1.5 pl-4">
            {analysis.flags.map((flag, i) => (
              <li key={i}>{flag}</li>
            ))}
          </ul>
        </Notice>
      )}

      {requirements.length > 0 ? (
        <Card>
          <h3 className="text-sm font-bold text-slate-900">Requirement by requirement</h3>
          <ul className="mt-1 divide-y divide-slate-100">
            {ordered.map((req, i) => (
              <RequirementRow key={`${req.requirement}-${i}`} req={req} />
            ))}
          </ul>
        </Card>
      ) : (
        <>
          <Block title="Required skills you match" empty="No matching skills were identified.">
            {analysis.matchedSkills.length ? <Chips items={analysis.matchedSkills} tone="good" /> : null}
          </Block>
          <Block title="Required skills not shown in your master CV" empty="Nothing missing was identified.">
            {analysis.missingSkills.length ? <Chips items={analysis.missingSkills} tone="bad" /> : null}
          </Block>
        </>
      )}

      <Block title="Job keywords used in this CV" empty="No job keywords were included.">
        {analysis.keywordsIncluded.length ? <Chips items={analysis.keywordsIncluded} /> : null}
      </Block>

      <Block title="Your strongest selling points" empty="No specific experience was highlighted.">
        {bullets(analysis.relevantExperience)}
      </Block>

      <Block title="Tips for this application" empty="No suggestions.">
        {bullets(analysis.suggestions)}
      </Block>
    </div>
  );
}
