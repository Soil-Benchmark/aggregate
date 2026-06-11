'use client';

import { useState } from 'react';
import { ArrowLeft, MapPin, Tractor, Users, X } from 'lucide-react';
import type { FarmFeature, FarmGroup, Label } from '@/lib/farmData';
import { cn, readableText } from '@/lib/utils';

type AddDialogProps = {
  groups: FarmGroup[];
  labels: Label[];
  onClose: () => void;
  onGroupAdded: (group: FarmGroup) => void;
  onFarmAdded: (farm: FarmFeature) => void;
};

type Mode = 'choose' | 'farm' | 'group';

type GeocodeResult = {
  id: string;
  label: string;
  lng: number;
  lat: number;
  postcode: string;
};

const inputClass =
  'w-full rounded-lg bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none ring-1 ring-white/15 transition focus:ring-white/50';
const labelClass = 'mb-1 block text-xs font-medium text-white/60';
const primaryBtn =
  'rounded-lg bg-[#ff7a00] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#ff8c1a] disabled:cursor-not-allowed disabled:opacity-50';

export const AddDialog = ({
  groups,
  labels,
  onClose,
  onGroupAdded,
  onFarmAdded,
}: AddDialogProps) => {
  const [mode, setMode] = useState<Mode>('choose');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // --- Farm form state ---
  const [addrQuery, setAddrQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [picked, setPicked] = useState<GeocodeResult | null>(null);
  const [hectares, setHectares] = useState('');
  const [farmGroupId, setFarmGroupId] = useState('');

  // --- Group form state ---
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [chosenLabels, setChosenLabels] = useState<string[]>([]);

  const sortedGroups = [...groups].sort((a, b) => a.name.localeCompare(b.name));

  const searchAddress = async () => {
    const q = addrQuery.trim();
    if (!q) return;
    setSearching(true);
    setError(null);
    try {
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';
      const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(
        q,
      )}&country=gb&limit=5&access_token=${token}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
      const json = await res.json();
      const next: GeocodeResult[] = (json.features ?? []).map(
        (f: {
          id?: string;
          geometry: { coordinates: [number, number] };
          properties: { full_address?: string; name?: string; context?: { postcode?: { name?: string } } };
        }) => ({
          id: f.id ?? `${f.geometry.coordinates.join(',')}`,
          label: f.properties.full_address ?? f.properties.name ?? 'Unknown place',
          lng: f.geometry.coordinates[0],
          lat: f.geometry.coordinates[1],
          postcode: f.properties.context?.postcode?.name ?? '',
        }),
      );
      setResults(next);
      if (next.length === 0) setError('No matching addresses found.');
    } catch (err) {
      setError(String(err));
    } finally {
      setSearching(false);
    }
  };

  const submitFarm = async () => {
    if (!picked) return setError('Search for and choose an address first.');
    const ha = Number(hectares);
    if (!(ha > 0)) return setError('Enter a farm size in hectares.');
    if (!farmGroupId) return setError('Choose a group.');
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/farms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: farmGroupId,
          lng: picked.lng,
          lat: picked.lat,
          hectares: ha,
          postcode: picked.postcode,
          address: picked.label,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to add farm');
      onFarmAdded(data.farm);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const submitGroup = async () => {
    if (!name.trim() || !contactName.trim() || !contactEmail.trim()) {
      return setError('Name, contact name and contact email are required.');
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          contactName,
          contactEmail,
          labels: chosenLabels,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to add group');
      onGroupAdded(data.group);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleLabel = (label: string) =>
    setChosenLabels((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label],
    );

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[88dvh] w-full max-w-md overflow-y-auto animate-[menu-pop_160ms_ease-out] rounded-2xl bg-slate-600/90 p-6 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-md"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 rounded p-1 text-white/60 transition hover:bg-white/10 hover:text-white"
        >
          <X size={18} />
        </button>

        {mode !== 'choose' && (
          <button
            type="button"
            onClick={() => {
              setMode('choose');
              setError(null);
            }}
            className="mb-3 inline-flex items-center gap-1 text-xs text-white/60 transition hover:text-white"
          >
            <ArrowLeft size={14} /> Back
          </button>
        )}

        {mode === 'choose' && (
          <>
            <h2 className="text-xl font-bold tracking-tight text-slate-100/90">
              Add to the map
            </h2>
            <p className="mt-1 text-sm text-white/70">
              Put your farm on the map, or register a new group.
            </p>
            <div className="mt-4 grid gap-3">
              <button
                type="button"
                onClick={() => setMode('farm')}
                className="flex items-center gap-3 rounded-xl bg-white/10 p-4 text-left ring-1 ring-white/15 transition hover:bg-white/15"
              >
                <Tractor size={22} className="shrink-0 text-[#ff9933]" />
                <span>
                  <span className="block text-sm font-semibold">Add your farm</span>
                  <span className="block text-xs text-white/60">
                    Find your address, set its size, and join a group.
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setMode('group')}
                className="flex items-center gap-3 rounded-xl bg-white/10 p-4 text-left ring-1 ring-white/15 transition hover:bg-white/15"
              >
                <Users size={22} className="shrink-0 text-[#ff9933]" />
                <span>
                  <span className="block text-sm font-semibold">Add a group</span>
                  <span className="block text-xs text-white/60">
                    Register a new farmer group others can join.
                  </span>
                </span>
              </button>
            </div>
          </>
        )}

        {mode === 'farm' && (
          <>
            <h2 className="text-xl font-bold tracking-tight text-slate-100/90">
              Add your farm
            </h2>

            <div className="mt-4 space-y-4">
              <div>
                <label className={labelClass}>Address</label>
                <div className="flex gap-2">
                  <input
                    value={addrQuery}
                    onChange={(e) => setAddrQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        searchAddress();
                      }
                    }}
                    placeholder="Postcode or address"
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={searchAddress}
                    disabled={searching}
                    className="shrink-0 rounded-lg bg-white/15 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/25 disabled:opacity-50"
                  >
                    {searching ? '…' : 'Search'}
                  </button>
                </div>

                {results.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {results.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setPicked(r);
                            setResults([]);
                            setAddrQuery(r.label);
                          }}
                          className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-white/90 transition hover:bg-white/10"
                        >
                          <MapPin size={14} className="mt-0.5 shrink-0 text-white/50" />
                          {r.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {picked && (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-1 text-xs text-white/80">
                    <MapPin size={12} className="text-[#ff9933]" />
                    {picked.label}
                  </p>
                )}
              </div>

              <div>
                <label className={labelClass}>Farm size (hectares)</label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={hectares}
                  onChange={(e) => setHectares(e.target.value)}
                  placeholder="e.g. 120"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Group</label>
                <select
                  value={farmGroupId}
                  onChange={(e) => setFarmGroupId(e.target.value)}
                  className={cn(inputClass, 'appearance-none')}
                >
                  <option value="" className="text-gray-900">
                    Choose a group…
                  </option>
                  {sortedGroups.map((g) => (
                    <option key={g.groupId} value={g.groupId} className="text-gray-900">
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {error && <p className="mt-3 text-xs text-red-200">{error}</p>}

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={submitFarm}
                disabled={submitting}
                className={primaryBtn}
              >
                {submitting ? 'Adding…' : 'Add farm'}
              </button>
            </div>
          </>
        )}

        {mode === 'group' && (
          <>
            <h2 className="text-xl font-bold tracking-tight text-slate-100/90">
              Add a group
            </h2>

            <div className="mt-4 space-y-4">
              <div>
                <label className={labelClass}>Group name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. The Furrow Fellowship"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="What the group is about"
                  className={cn(inputClass, 'resize-none')}
                />
              </div>
              <div>
                <label className={labelClass}>Contact name</label>
                <input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Contact email</label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Labels</label>
                <div className="flex flex-wrap gap-1.5">
                  {labels.map((l) => {
                    const selected = chosenLabels.includes(l.label);
                    return (
                      <button
                        key={l.label}
                        type="button"
                        onClick={() => toggleLabel(l.label)}
                        className={cn(
                          'rounded-full border-transparent px-3 py-1 text-xs font-semibold transition',
                          selected ? 'ring-2 ring-white' : 'opacity-70 hover:opacity-100',
                        )}
                        style={{ backgroundColor: l.color, color: readableText(l.color) }}
                      >
                        {l.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {error && <p className="mt-3 text-xs text-red-200">{error}</p>}

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={submitGroup}
                disabled={submitting}
                className={primaryBtn}
              >
                {submitting ? 'Adding…' : 'Add group'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
