import type { ReactNode } from 'react';
import type { Analysis, Generator } from '../types';
import { Card, Chips, Notice } from './ui';

function Block({ title, empty, children }: { title: string; empty: string; children: ReactNode | null }) {
  return (
    <Card>
      <h3 className="mb-2.5 text-sm font-semibold text-slate-900">{title}</h3>
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

export function AnalysisPanel({ analysis, generatedBy }: { analysis: Analysis; generatedBy: Generator }) {
  const score = Math.max(0, Math.min(100, Math.round(analysis.score)));
  const tone = score >= 70 ? 'text-emerald-700' : score >= 45 ? 'text-amber-700' : 'text-red-700';
  const bar = score >= 70 ? 'bg-emerald-600' : score >= 45 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Estimated job alignment</h3>
            <p className="text-xs text-slate-500">{generatedBy === 'ai' ? 'Approximate, AI-generated estimate' : 'Rough keyword-overlap estimate (demo mode, no AI)'}</p>
          </div>
          <p className={`text-4xl leading-none font-bold tabular-nums ${tone}`}>
            {score}
            <span className="text-lg font-semibold text-slate-400">/100</span>
          </p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`Estimated alignment ${score} out of 100`}>
          <div className={`h-full rounded-full ${bar}`} style={{ width: `${score}%` }} />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-600">
          This is an estimate based on your master CV and the job description. It is not a real ATS result and does not guarantee you will be shortlisted.
        </p>
      </Card>

      {analysis.flags.length > 0 && (
        <Notice kind="warn" title="Check before sending">
          <ul className="list-disc space-y-1.5 pl-4">
            {analysis.flags.map((flag, i) => (
              <li key={i}>{flag}</li>
            ))}
          </ul>
        </Notice>
      )}

      <Block title="Required skills you match" empty="No matching skills were identified.">
        {analysis.matchedSkills.length ? <Chips items={analysis.matchedSkills} tone="good" /> : null}
      </Block>

      <Block title="Required skills not shown in your master CV" empty="Nothing missing was identified.">
        {analysis.missingSkills.length ? (
          <>
            <Chips items={analysis.missingSkills} tone="bad" />
            <p className="mt-3 text-xs leading-relaxed text-slate-600">
              These were deliberately left out of your CV. If you genuinely have one of them, add it to your master CV and tailor again.
            </p>
          </>
        ) : null}
      </Block>

      <Block title="Relevant experience identified" empty="No specific experience was highlighted.">
        {bullets(analysis.relevantExperience)}
      </Block>

      <Block title="Keywords included in this CV" empty="No job keywords were included.">
        {analysis.keywordsIncluded.length ? <Chips items={analysis.keywordsIncluded} /> : null}
      </Block>

      <Block title="Suggestions for your application" empty="No suggestions.">
        {bullets(analysis.suggestions)}
      </Block>
    </div>
  );
}
