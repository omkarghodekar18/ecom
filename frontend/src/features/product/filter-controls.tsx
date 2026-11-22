'use client';

// Individual filter controls (spec 6.3): checkbox lists (ENUM/brand), numeric
// ranges with unit, dropdown selects and fallback value inputs — shared by
// the filter-bar group popovers and the full-height filter drawer. Controls
// are value-driven (no navigation): the bar pushes to the URL immediately,
// the drawer edits a local draft until "Show X results" is applied.

import { useState, type KeyboardEvent } from 'react';
import { Checkbox, Input, Select } from '@/components/ui';
import type { AttrFilterValue } from '@/lib/filter-url';
import type { CategoryAttributeDto } from '@/shared/dto/catalog.dto';
import { toggleAttrValue } from './filter-groups';

export interface FilterOption {
  value: string;
  label: string;
}

// ── search helpers (drawer "search inside filters") ─────────────────────────

export function normalizeSearch(query: string | undefined): string {
  return (query ?? '').trim().toLowerCase();
}

export function textMatches(text: string, normalizedQuery: string): boolean {
  return normalizedQuery.length === 0 || text.toLowerCase().includes(normalizedQuery);
}

/** An attribute is shown when its label or one of its enum values matches. */
export function attrMatchesSearch(def: CategoryAttributeDto, query: string | undefined): boolean {
  const q = normalizeSearch(query);
  if (q.length === 0) return true;
  return (
    textMatches(def.label, q) ||
    (def.enumValues ?? []).some((value) => textMatches(value, q)) ||
    textMatches(def.groupName, q)
  );
}

export function brandMatchesSearch(name: string, query: string | undefined): boolean {
  return textMatches(name, normalizeSearch(query));
}

// ── shared control props ─────────────────────────────────────────────────────

export interface AttrControlProps {
  def: CategoryAttributeDto;
  /** Currently selected value for this attribute (undefined = no filter). */
  value: AttrFilterValue | undefined;
  /** Emits the next value; `undefined` removes the filter. */
  onValueChange: (next: AttrFilterValue | undefined) => void;
  /** Drawer search query — filters the visible checkbox options. */
  searchQuery?: string;
}

function ControlLabel({ def }: { def: CategoryAttributeDto }) {
  return (
    <p className="text-sm font-medium text-ink">
      {def.label}
      {def.unit ? <span className="text-muted"> ({def.unit})</span> : null}
    </p>
  );
}

// ── checkbox list (ENUM values or brands) ────────────────────────────────────

export interface CheckboxListControlProps {
  options: FilterOption[];
  selected: string[];
  onToggle: (value: string) => void;
  searchQuery?: string;
  /** The owning label already matches the search → keep all options visible. */
  labelMatchesSearch?: boolean;
  /** Announced to screen readers. */
  listLabel: string;
}

export function CheckboxListControl({
  options,
  selected,
  onToggle,
  searchQuery,
  labelMatchesSearch = false,
  listLabel,
}: CheckboxListControlProps) {
  const q = normalizeSearch(searchQuery);
  const visible =
    q.length === 0 || labelMatchesSearch
      ? options
      : options.filter((option) => textMatches(option.label, q));
  if (q.length > 0 && visible.length === 0) return null;

  return (
    <ul
      aria-label={listLabel}
      className="slim-scrollbar max-h-64 space-y-2 overflow-y-auto pr-1"
    >
      {visible.map((option) => (
        <li key={option.value}>
          <Checkbox
            label={option.label}
            checked={selected.includes(option.value)}
            onCheckedChange={() => onToggle(option.value)}
          />
        </li>
      ))}
    </ul>
  );
}

// ── numeric range ────────────────────────────────────────────────────────────

export function RangeControl({ def, value, onValueChange }: AttrControlProps) {
  const [minDraft, setMinDraft] = useState<string | null>(null);
  const [maxDraft, setMaxDraft] = useState<string | null>(null);

  /** null draft = untouched (keep existing); '' = cleared. */
  const parse = (raw: string | null, current: number | undefined): number | undefined => {
    if (raw === null) return current;
    const trimmed = raw.trim();
    if (trimmed === '') return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : current;
  };

  const commit = () => {
    const min = parse(minDraft, value?.min);
    const max = parse(maxDraft, value?.max);
    setMinDraft(null);
    setMaxDraft(null);
    if (min === undefined && max === undefined) {
      if (value !== undefined) onValueChange(undefined);
      return;
    }
    if (min !== value?.min || max !== value?.max) onValueChange({ min, max });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.currentTarget.blur();
    }
  };

  const minDisplay = minDraft ?? (value?.min !== undefined ? String(value.min) : '');
  const maxDisplay = maxDraft ?? (value?.max !== undefined ? String(value.max) : '');

  return (
    <div className="space-y-1.5">
      <ControlLabel def={def} />
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="decimal"
          step="any"
          size="sm"
          aria-label={`${def.label} — minimum${def.unit ? ` in ${def.unit}` : ''}`}
          placeholder="min"
          value={minDisplay}
          onChange={(e) => setMinDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
        />
        <span className="text-muted" aria-hidden="true">
          –
        </span>
        <Input
          type="number"
          inputMode="decimal"
          step="any"
          size="sm"
          aria-label={`${def.label} — maximum${def.unit ? ` in ${def.unit}` : ''}`}
          placeholder="max"
          value={maxDisplay}
          onChange={(e) => setMaxDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
        />
      </div>
    </div>
  );
}

// ── dropdown (DROPDOWN widget with enum values) ──────────────────────────────

const DROPDOWN_ALL = '__all__';

export function DropdownControl({ def, value, onValueChange }: AttrControlProps) {
  const options: FilterOption[] = [{ value: DROPDOWN_ALL, label: 'All' }];
  for (const entry of def.enumValues ?? []) {
    options.push({ value: entry, label: entry });
  }
  return (
    <Select
      label={def.label}
      size="sm"
      options={options}
      value={value?.values?.[0] ?? DROPDOWN_ALL}
      onValueChange={(next) => onValueChange(next === DROPDOWN_ALL ? undefined : { values: [next] })}
    />
  );
}

// ── single boolean ───────────────────────────────────────────────────────────

export function BooleanControl({ def, value, onValueChange }: AttrControlProps) {
  return (
    <div className="space-y-1.5">
      <ControlLabel def={def} />
      <Checkbox
        label="Yes"
        checked={(value?.values ?? []).includes('true')}
        onCheckedChange={(checked) => onValueChange(checked ? { values: ['true'] } : undefined)}
      />
    </div>
  );
}

// ── free value input (STRING attributes without a known value list) ─────────

export function TextValuesControl({ def, value, onValueChange }: AttrControlProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? (value?.values ?? []).join(', ');

  const commit = () => {
    if (draft === null) return;
    const values = draft
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
    setDraft(null);
    const current = value?.values ?? [];
    if (values.join(',') !== current.join(',')) {
      onValueChange(values.length > 0 ? { values } : undefined);
    }
  };

  return (
    <Input
      label={def.label}
      size="sm"
      placeholder="Value(s), comma-separated"
      hint="Matches any of the entered values"
      value={display}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}

// ── dispatcher ───────────────────────────────────────────────────────────────

/** Renders the type/widget-appropriate control for one attribute definition. */
export function AttrFilterControl(props: AttrControlProps) {
  const { def } = props;
  if (def.type === 'NUMBER') return <RangeControl {...props} />;
  if (def.type === 'BOOLEAN') return <BooleanControl {...props} />;
  if (def.filterWidget === 'DROPDOWN' && def.enumValues && def.enumValues.length > 0) {
    return <DropdownControl {...props} />;
  }
  if (def.type === 'ENUM' && def.enumValues && def.enumValues.length > 0) {
    const options: FilterOption[] = def.enumValues.map((v) => ({ value: v, label: v }));
    return (
      <div className="space-y-1.5">
        <ControlLabel def={def} />
        <CheckboxListControl
          options={options}
          selected={props.value?.values ?? []}
          onToggle={(option) => props.onValueChange(toggleAttrValue(props.value, option))}
          searchQuery={props.searchQuery}
          labelMatchesSearch={textMatches(def.label, normalizeSearch(props.searchQuery))}
          listLabel={def.label}
        />
      </div>
    );
  }
  return <TextValuesControl {...props} />;
}
