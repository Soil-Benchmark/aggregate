'use client';

import { Fragment, useRef, useState } from 'react';
import { MessageSquareQuote, Stamp, Waves } from 'lucide-react';
import type { Label } from '@/lib/farmData';
import type { Filter } from '@/lib/filters';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type SearchBarProps = {
  labels: Label[];
  districts: string[];
  filters: Filter[];
  onChange: (filters: Filter[]) => void;
};

/** Filter category the user is composing in the input. */
type Category = 'label' | 'name' | 'catchment';

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

export const SearchBar = ({ labels, districts, filters, onChange }: SearchBarProps) => {
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

  // River basin districts the user has selected (selection order preserved).
  const appliedDistricts = filters.flatMap((f) =>
    f.kind === 'catchment' ? [f.district] : [],
  );
  const hasCatchmentFilter = appliedDistricts.length > 0;

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

  const toggleDistrict = (district: string) => {
    if (appliedDistricts.includes(district)) {
      onChange(
        filters.filter((f) => !(f.kind === 'catchment' && f.district === district)),
      );
    } else {
      onChange([...filters, { kind: 'catchment', district }]);
    }
    setQuery('');
    focusInput();
  };

  const startCategory = (next: Category) => {
    setCategory(next);
    // Resume the existing name query when re-entering "name"; otherwise the
    // text is just a palette/suggestion filter and starts empty.
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

  // Deleting the "catchment" tag removes all river basin district filters.
  const removeCatchmentCategory = () => {
    onChange(filters.filter((f) => f.kind !== 'catchment'));
    if (category === 'catchment') clearComposing();
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
    } else if (category === 'catchment') {
      if (hasCatchmentFilter) setQuery('');
      else clearComposing();
    }
  };

  // Options offered in the palette, narrowed by the free text after the tag.
  const q = query.trim().toLowerCase();
  const visibleLabels =
    category === 'label'
      ? labels.filter((l) => l.label.toLowerCase().includes(q))
      : [];
  const visibleDistricts =
    category === 'catchment'
      ? districts.filter((d) => d.toLowerCase().includes(q))
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

  const placeholder =
    category === 'name'
      ? 'Search group names'
      : category === 'catchment'
        ? 'Search for catchment areas or choose below'
        : showPlaceholder
          ? focused
            ? 'Search for farms by distance, area, labels and more'
            : 'Search Aggregate'
          : '';

  const categoryChipBase =
    'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition';

  // Order the category segments in the search text by when each filter type was
  // first added (filters order), with the category being composed appended last.
  const categoryOrder: Category[] = [];
  for (const f of filters) {
    if (!categoryOrder.includes(f.kind)) categoryOrder.push(f.kind);
  }
  if (category && !categoryOrder.includes(category)) categoryOrder.push(category);

  const renderCategorySegment = (c: Category) => {
    if (c === 'label') {
      return (
        <Fragment key="label">
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
        </Fragment>
      );
    }

    if (c === 'name') {
      // While composing, the input is the editor; otherwise show the query text.
      return (
        <Fragment key="name">
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
        </Fragment>
      );
    }

    // catchment: "river basin" tag + chosen districts as plain text (same as
    // the suggestions below), each with an ×.
    return (
      <Fragment key="catchment">
        {(category === 'catchment' || hasCatchmentFilter) && (
          <Badge className="gap-1.5 rounded-full border-transparent bg-sky-200 px-3 py-1 text-sm font-semibold text-sky-950">
            <Waves size={14} aria-hidden="true" />
            river basin
            <button
              type="button"
              onClick={removeCatchmentCategory}
              aria-label="Remove river basin filter"
              className="ml-0.5 rounded-full hover:bg-sky-950/10"
            >
              ×
            </button>
          </Badge>
        )}
        {appliedDistricts.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => toggleDistrict(d)}
            aria-label={`Remove ${d}`}
            className="flex items-center gap-1.5 text-lg font-semibold text-white transition hover:text-white/80"
          >
            <Waves size={18} aria-hidden="true" />
            {d}
            <span aria-hidden="true" className="opacity-80">
              ×
            </span>
          </button>
        ))}
      </Fragment>
    );
  };

  return (
    <div
      ref={containerRef}
      onBlur={handleBlur}
      onClick={focusInput}
      className="absolute left-1/2 top-4 z-10 w-[min(92vw,720px)] -translate-x-1/2 cursor-text rounded-2xl bg-slate-500/80 px-4 py-3 text-white shadow-xl backdrop-blur-md"
    >
      {/* Input row: search icon, composing tags, applied pills, text input, clear */}
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-white/90">
          <SearchIcon />
        </span>

        <div className="flex flex-1 flex-wrap items-center gap-2">
          {categoryOrder.map(renderCategorySegment)}

          <input
            ref={inputRef}
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onFocus={() => setFocused(true)}
            placeholder={placeholder}
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
          <button
            type="button"
            onClick={() => startCategory('catchment')}
            className={cn(
              categoryChipBase,
              'bg-sky-200/90 text-sky-950 hover:bg-sky-200',
              category === 'catchment' && 'ring-2 ring-white',
            )}
          >
            <Waves size={16} aria-hidden="true" />
            river basin
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

      {/* Catchment suggestions: river basin districts, filtered by free text */}
      {focused && category === 'catchment' && (
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          {visibleDistricts.length === 0 ? (
            <span className="text-sm text-white/70">No matching catchment areas</span>
          ) : (
            visibleDistricts.map((d) => {
              const selected = appliedDistricts.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDistrict(d)}
                  aria-label={selected ? `Remove ${d}` : `Add ${d}`}
                  className={cn(
                    'flex items-center gap-1.5 text-lg font-semibold transition',
                    selected ? 'text-white' : 'text-white/80 hover:text-white',
                  )}
                >
                  <Waves size={18} aria-hidden="true" />
                  {d}
                  {selected && (
                    <span aria-hidden="true" className="opacity-80">
                      ×
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
