'use client';

import { useRef, useState } from 'react';
import { MessageSquareQuote, Stamp } from 'lucide-react';
import type { Label } from '@/lib/farmData';
import type { Filter } from '@/lib/filters';
import { Badge } from '@/components/ui/badge';
import { cn, readableText } from '@/lib/utils';

type SearchBarProps = {
  labels: Label[];
  filters: Filter[];
  onChange: (filters: Filter[]) => void;
};

/** Filter category the user is composing in the input. */
type Category = 'label' | 'name';

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

  const hasNameFilter = filters.some((f) => f.kind === 'name');
  // Committed group-name query (empty when no name filter is active).
  const nameQuery = filters.flatMap((f) => (f.kind === 'name' ? [f.query] : []))[0] ?? '';

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
    // Resume the existing name query when re-entering "name"; otherwise the
    // text is just a palette filter and starts empty.
    setQuery(next === 'name' ? nameQuery : '');
    focusInput();
  };

  // Drop the in-progress composing state, keeping applied filters.
  const clearComposing = () => {
    setCategory(null);
    setQuery('');
  };

  // Free text is the group-name filter while composing "name"; keep it in sync.
  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (category === 'name') {
      const others = filters.filter((f) => f.kind !== 'name');
      onChange(value.trim() ? [...others, { kind: 'name', query: value }] : others);
    }
  };

  // Deleting the "has label" tag also removes the label filters it represents.
  const removeLabelCategory = () => {
    onChange(filters.filter((f) => f.kind !== 'label'));
    if (category === 'label') clearComposing();
  };

  // Deleting the "name" tag removes the group-name filter.
  const removeNameCategory = () => {
    onChange(filters.filter((f) => f.kind !== 'name'));
    if (category === 'name') clearComposing();
  };

  const clearAll = () => {
    onChange([]);
    clearComposing();
    setFocused(false);
  };

  // Collapse when focus leaves the whole bar. Keep a composing tag if it
  // produced an active filter; only drop it when it was an empty/abandoned click.
  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (containerRef.current?.contains(e.relatedTarget as Node)) return;
    setFocused(false);
    if (category === 'name') {
      if (!hasNameFilter) clearComposing();
    } else if (category === 'label') {
      if (appliedLabels.length > 0) setQuery('');
      else clearComposing();
    }
  };

  // Labels offered in the palette, narrowed by the free text after "has label".
  const q = query.trim().toLowerCase();
  const visibleLabels =
    category === 'label'
      ? labels.filter((l) => l.label.toLowerCase().includes(q))
      : [];

  const composingName = category === 'name';
  const isPristine =
    !focused && category === null && query === '' && filters.length === 0;
  const showPlaceholder =
    category === null && query === '' && filters.length === 0;
  // When collapsed with chips present and no free text to show, the empty input
  // would wrap onto a second row — shrink it so the bar stays a single row.
  const collapsedWithChips =
    !focused && query === '' && (filters.length > 0 || category !== null);

  const categoryChipBase =
    'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition';

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
          {(category === 'label' || appliedLabels.length > 0) && (
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

          {/* "name" tag: while composing, the input below is its editor; when a
              name filter is active but not composing, show its query statically. */}
          {(composingName || hasNameFilter) && (
            <Badge className="gap-1.5 rounded-full border-transparent bg-white px-3 py-1 text-sm font-semibold text-slate-900">
              <MessageSquareQuote size={14} aria-hidden="true" />
              name
              <button
                type="button"
                onClick={removeNameCategory}
                aria-label="Remove name filter"
                className="ml-0.5 rounded-full hover:bg-slate-900/10"
              >
                ×
              </button>
            </Badge>
          )}
          {!composingName && hasNameFilter && (
            <button
              type="button"
              onClick={() => startCategory('name')}
              className="text-lg text-white/90 hover:text-white"
            >
              {nameQuery}
            </button>
          )}

          <input
            ref={inputRef}
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onFocus={() => setFocused(true)}
            placeholder={
              composingName
                ? 'Search group names'
                : showPlaceholder
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

      {/* Category chips: shown while focused, the active one highlighted */}
      {focused && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => startCategory('label')}
            className={cn(
              categoryChipBase,
              'bg-emerald-200/90 text-emerald-950 hover:bg-emerald-200',
              category === 'label' && 'ring-2 ring-white',
            )}
          >
            <Stamp size={16} aria-hidden="true" />
            has label
          </button>
          <button
            type="button"
            onClick={() => startCategory('name')}
            className={cn(
              categoryChipBase,
              'bg-white/90 text-slate-900 hover:bg-white',
              category === 'name' && 'ring-2 ring-white',
            )}
          >
            <MessageSquareQuote size={16} aria-hidden="true" />
            name
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
