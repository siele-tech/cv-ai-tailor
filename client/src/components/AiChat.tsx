import { useId, type FormEvent, type RefObject } from 'react';
import type { ChatMessage } from '../types';
import { Button, Card, Notice } from './ui';
import { WorkingCard } from './WorkingCard';

const EXAMPLES = ['Make the summary shorter', 'Match the wording of the job description more closely', 'Put education before experience'];

interface Props {
  aiConfigured: boolean;
  messages: ChatMessage[];
  value: string;
  onChange(value: string): void;
  onSend(): void;
  busy: boolean;
  disabled: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}

/** Free-text instructions to the AI about the CV that is open. */
export function AiChat({ aiConfigured, messages, value, onChange, onSend, busy, disabled, inputRef }: Props) {
  const id = useId();

  function submit(event: FormEvent) {
    event.preventDefault();
    if (value.trim().length >= 2) onSend();
  }

  return (
    <Card>
      <label htmlFor={id} className="block font-semibold text-slate-900">
        Tell the AI what to change
      </label>
      <p className="mt-0.5 text-sm leading-relaxed text-slate-600">
        Ask for changes in your own words, tell it true things about you that are missing, or paste a full job description to re-tailor this CV to it.
      </p>

      {!aiConfigured ? (
        <div className="mt-3">
          <Notice kind="warn">Instructions need an AI provider. Add an AI API key on the server (see Settings).</Notice>
        </div>
      ) : (
        <>
          {messages.length > 0 && (
            <ul className="mt-3 space-y-2" aria-label="Conversation with the AI">
              {messages.slice(-6).map((message, i) => (
                <li key={i} className={`max-w-[92%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-line ${message.from === 'you' ? 'ml-auto rounded-br-md bg-gradient-to-br from-brand-600 to-violet-600 text-white' : 'rounded-bl-md bg-slate-100 text-slate-800'}`}>
                  <span className="sr-only">{message.from === 'you' ? 'You: ' : 'AI: '}</span>
                  {message.text}
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={submit} className="mt-3 space-y-2.5">
            <textarea
              id={id}
              ref={inputRef}
              rows={3}
              value={value}
              maxLength={20000}
              disabled={busy}
              onChange={(e) => onChange(e.target.value)}
              placeholder="e.g. I also trained new staff at my current job. Add it."
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none disabled:bg-slate-50"
            />
            {busy ? (
              <WorkingCard title="Updating your CV" steps={['Reading your instruction', 'Updating your CV', 'Checking every claim against your master CV', 'Re-scoring the match']} hint="usually 10–40 seconds" stepSeconds={5} />
            ) : (
              <>
                {!value && (
                  <div className="flex flex-wrap gap-1.5">
                    {EXAMPLES.map((example) => (
                      <button key={example} type="button" onClick={() => onChange(example)} className="min-h-9 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200">
                        {example}
                      </button>
                    ))}
                  </div>
                )}
                <Button type="submit" variant="primary" icon="sparkles" className="w-full" disabled={disabled || value.trim().length < 2}>
                  Send to AI
                </Button>
              </>
            )}
          </form>
        </>
      )}
    </Card>
  );
}
