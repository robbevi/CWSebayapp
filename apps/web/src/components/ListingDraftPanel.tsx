import { composeDraft, draftReadiness, type PartGroup } from '@warehouse/shared';
import { Check, ChevronDown, Copy, FileText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from './ui/Button';

/**
 * The listing content SPARE can assemble for a part that has been photographed, counted and
 * conditioned.
 *
 * It stops at assembling. eBay's Listing Draft API — the one that puts a draft into Seller
 * Hub — is a Limited Release we are not approved for, and the Inventory API's alternative
 * makes offers that stay invisible on eBay until published, which is not a draft. So this
 * gets the tedious part right and leaves the listing itself to a person.
 */

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-textMuted hover:bg-surfaceMuted hover:text-textPri"
      aria-label={`Copy ${label}`}
    >
      {copied ? <Check size={11} className="text-success" /> : <Copy size={11} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-textMuted">{label}</span>
        <CopyButton value={value} label={label} />
      </div>
      <p className="break-words text-xs text-textPri">{value}</p>
    </div>
  );
}

export function ListingDraftPanel({ group }: { group: PartGroup }) {
  const [open, setOpen] = useState(false);
  const readiness = draftReadiness(group);
  const draft = useMemo(() => composeDraft(group, window.location.origin), [group]);

  if (!readiness.ready || !draft) return null;

  // The description without markup: what a person actually pastes into eBay's editor.
  const plainDescription = draft.descriptionHtml
    .replace(/<li>/g, '\n• ')
    .replace(/<\/(p|ul|li)>/g, '\n')
    .replace(/<p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{2,}/g, '\n')
    .trim();

  return (
    <div className="rounded-card border border-primary/30 bg-primary/5 p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-textPri">
            <FileText size={13} />
            Listing content ready
          </span>
          <span className="mt-0.5 block text-[11px] text-textMuted">
            Title, description and {draft.imageUrls.length}{' '}
            {draft.imageUrls.length === 1 ? 'photo' : 'photos'}
            {readiness.missing.includes('price') ? ' — no price on file yet' : ''}
          </span>
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-textMuted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="mt-3 space-y-2.5 border-t border-primary/20 pt-3">
          <Field label={`Title (${draft.title.length}/80)`} value={draft.title} />
          <Field label="Description" value={plainDescription} />
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Condition" value={draft.condition.replace(/_/g, ' ')} />
            <Field label="Quantity" value={String(draft.quantity)} />
            <Field label="Part number" value={draft.mpn} />
            <Field
              label="Price"
              value={draft.price != null ? `$${draft.price.toFixed(2)}` : 'Not set'}
            />
          </div>
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-textMuted">
                Photo links ({draft.imageUrls.length})
              </span>
              <CopyButton value={draft.imageUrls.join('\n')} label="photo links" />
            </div>
            <p className="text-[11px] text-textMuted">
              Public URLs — paste into eBay rather than re-uploading the files.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void navigator.clipboard.writeText(
                `${draft.title}\n\n${plainDescription}\n\nCondition: ${draft.condition.replace(/_/g, ' ')}\nQuantity: ${draft.quantity}\nPart number: ${draft.mpn}\nPrice: ${draft.price != null ? `$${draft.price.toFixed(2)}` : 'not set'}\n\n${draft.imageUrls.join('\n')}`
              );
            }}
            className="w-full"
          >
            <Copy size={13} />
            Copy everything
          </Button>
        </div>
      )}
    </div>
  );
}
