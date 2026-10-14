import { useRef, useState } from 'react';
import { Button, Icon } from './ui';

/** Copy text to the clipboard, falling back to selecting it in a field when the API is unavailable. */
export async function copyText(text: string, field?: HTMLInputElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (!field) return false;
    field.focus();
    field.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    }
  }
}

interface Props {
  link: string;
  /** What the native share sheet sends along with the link. */
  shareTitle: string;
  shareText?: string;
}

/**
 * A link shown in full, with one big "Copy link" button and, on phones that support it,
 * "Share…" to send it straight to WhatsApp, SMS or email.
 */
export function CopyLink({ link, shareTitle, shareText }: Props) {
  const field = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function copy() {
    const done = await copyText(link, field.current);
    setCopied(done ? 'yes' : 'failed');
    setTimeout(() => setCopied(null), 2500);
  }

  async function share() {
    try {
      await navigator.share({ title: shareTitle, text: shareText, url: link });
    } catch {
      // cancelled
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={field}
        readOnly
        value={link}
        aria-label="Link"
        onFocus={(e) => e.currentTarget.select()}
        onClick={(e) => e.currentTarget.select()}
        className="h-12 w-full rounded-xl border border-emerald-200 bg-emerald-50 px-3 font-mono text-[13px] text-emerald-900 focus:ring-2 focus:ring-emerald-300 focus:outline-none"
      />
      <div className={`grid gap-2 ${canShare ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <Button variant="primary" onClick={copy} className={copied === 'yes' ? '!from-emerald-600 !to-emerald-600' : ''}>
          <Icon name={copied === 'yes' ? 'check' : 'clip'} />
          {copied === 'yes' ? 'Copied!' : 'Copy link'}
        </Button>
        {canShare && (
          <Button icon="up" onClick={share}>
            Share…
          </Button>
        )}
      </div>
      {copied === 'failed' && <p className="text-xs text-amber-700">Could not copy automatically. The link is selected above: long-press it and choose Copy.</p>}
    </div>
  );
}
