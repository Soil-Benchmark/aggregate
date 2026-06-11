'use client';

import { useRef, useState } from 'react';
import { Stamp } from 'lucide-react';
import type { Label } from '@/lib/farmData';
import type { Filter } from '@/lib/filters';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type SearchBarProps = {
  labels: Label[];
  filters: Filter[];
  onChange: (filters: Filter[]) => void;
};

/** Filter category the user is composing in the input. */
type Category = 'label';

/** Returns black or white depending on which reads better on `hex`. */
const readableText = (hex: string): string => {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  // Perceived luminance (sRGB).
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1a1a1a' : '#ffffff';
};

const SearchIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
    <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const CloseIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const SearchBar = ({ labels, filters, onChange }: SearchBarProps) => {
  const [focused, setFocused] = useState(false);
  const [category, setCategory] = useState<Category | null>(null);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeLabels = new Set(
    filters.filter((f) => f.kind === 'label').map((f) => f.label),
  );
  // Preserve the order the user clicked labels in (filters order), not the
  // order they happen to appear in labels.json.
  const labelsByName = new Map(labels.map((l) => [l.label, l]));
  const appliedLabels = filters
    .filter((f) => f.kind === 'label')
    .map((f) => labelsByName.get(f.label))
    .filter((l): l is Label => l !== undefined);

  const focusInput = () => inputRef.current?.focus();

  const toggleLabel = (label: string) => {
    if (activeLabels.has(label)) {
      onChange(filters.filter((f) => !(f.kind === 'label' && f.label === label)));
    } else {
      onChange([...filters, { kind: 'label', label }]);
    }
    setQuery('');
    focusInput();
  };

  const startCategory = (next: Category) => {
    setCategory(next);
    setQuery('');
    focusInput();
  };

  // Drop the in-progress composing state, keeping applied filters.
  const clearComposing = () => {
    setCategory(null);
    setQuery('');
  };

  // Deleting the "has label" tag also removes the label filters it represents.
  const removeLabelCategory = () => {
    onChange(filters.filter((f) => f.kind !== 'label'));
    clearComposing();
  };

  const clearAll = () => {
    onChange([]);
    clearComposing();
    setFocused(false);
  };

  // Collapse when focus leaves the whole bar. Keep the "has label" tag if it
  // produced active filters; only drop it when it was an empty/abandoned click.
  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (containerRef.current?.contains(e.relatedTarget as Node)) return;
    setFocused(false);
    if (appliedLabels.length === 0) clearComposing();
    else setQuery('');
  };

  // Labels offered in the palette, narrowed by the free text after "has label".
  const q = query.trim().toLowerCase();
  const visibleLabels =
    category === 'label'
      ? labels.filter((l) => l.label.toLowerCase().includes(q))
      : [];

  const isPristine =
    !focused && category === null && query === '' && appliedLabels.length === 0;
  const showPlaceholder =
    category === null && query === '' && appliedLabels.length === 0;
  // When collapsed with chips present, the empty text input would wrap onto a
  // second row — shrink it to zero so the bar stays a single row.
  const collapsedWithChips =
    !focused && (appliedLabels.length > 0 || category !== null);

  return (
    <div
      ref={containerRef}
      onBlur={handleBlur}
      onClick={focusInput}
      className="absolute left-1/2 top-4 z-10 w-[min(92vw,720px)] -translate-x-1/2 cursor-text rounded-2xl bg-slate-500/80 px-4 py-3 text-white shadow-xl backdrop-blur-md"
    >
      {/* Input row: search icon, composing chip, applied pills, text input, clear */}
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-white/90">
          <SearchIcon />
        </span>

        <div className="flex flex-1 flex-wrap items-center gap-2">
          {category === 'label' && (
            <Badge className="gap-1.5 rounded-full border-transparent bg-emerald-200 px-3 py-1 text-sm font-semibold text-emerald-950">
              <Stamp size={14} aria-hidden="true" />
              has label
              <button
                type="button"
                onClick={removeLabelCategory}
                aria-label="Remove has label filter"
                className="ml-0.5 rounded-full hover:bg-emerald-950/10"
              >
                ×
              </button>
            </Badge>
          )}

          {appliedLabels.map((l) => (
            <Badge
              key={l.label}
              asChild
              className="cursor-pointer rounded-full border-transparent px-3 py-1 text-sm font-semibold"
              style={{ backgroundColor: l.color, color: readableText(l.color) }}
            >
              <button type="button" onClick={() => toggleLabel(l.label)}>
                {l.label}
                <span aria-hidden="true" className="opacity-80">
                  ×
                </span>
              </button>
            </Badge>
          ))}

          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            placeholder={
              showPlaceholder
                ? focused
                  ? 'Search for farms by distance, area, labels and more'
                  : 'Search Aggregate'
                : ''
            }
            className={cn(
              'bg-transparent text-lg outline-none placeholder:text-white/70',
              collapsedWithChips ? 'w-0 min-w-0 flex-none p-0' : 'min-w-32 flex-1',
            )}
          />
        </div>

        {!isPristine && (
          <button
            type="button"
            onClick={clearAll}
            aria-label="Clear search"
            className="shrink-0 rounded-full p-1 text-white/90 transition hover:bg-white/10"
          >
            <CloseIcon />
          </button>
        )}
      </div>

      {/* Category chips: shown when focused and not yet composing a category */}
      {focused && category === null && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => startCategory('label')}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-200/90 px-3 py-1.5 text-sm font-medium text-emerald-950 transition hover:bg-emerald-200"
          >
            <Stamp size={16} aria-hidden="true" />
            has label
          </button>
        </div>
      )}

      {/* Label palette: shown while composing "has label", filtered by free text */}
      {focused && category === 'label' && (
        <div className="mt-3 flex flex-wrap gap-2">
          {visibleLabels.length === 0 ? (
            <span className="text-sm text-white/70">No matching labels</span>
          ) : (
            visibleLabels.map((l) => {
              const selected = activeLabels.has(l.label);
              return (
                <Badge
                  key={l.label}
                  asChild
                  className={cn(
                    'cursor-pointer rounded-full border-transparent px-3 py-1 text-sm font-semibold transition',
                    selected ? 'ring-2 ring-white' : 'opacity-90 hover:opacity-100',
                  )}
                  style={{ backgroundColor: l.color, color: readableText(l.color) }}
                >
                  <button type="button" onClick={() => toggleLabel(l.label)}>
                    {l.label}
                  </button>
                </Badge>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
