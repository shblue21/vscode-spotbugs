import { Finding } from '../model/finding';
import {
  FindingFacetFilterKind,
  toFindingFacets,
} from './findingFacets';

export type FindingFilterKind = FindingFacetFilterKind;

export type FindingFilterState = Partial<Record<FindingFilterKind, string>>;

export interface FindingFilterOption {
  value: string;
  label: string;
  count: number;
  detail?: string;
}

const FILTER_KIND_LABELS: Record<FindingFilterKind, string> = {
  severity: 'Severity',
  category: 'Category',
  package: 'Package',
  class: 'Class',
  path: 'Path',
  rule: 'Rule',
};

const FILTER_KIND_ORDER: FindingFilterKind[] = [
  'severity',
  'category',
  'package',
  'class',
  'path',
  'rule',
];

const SEVERITY_ORDER = ['Error', 'Warning', 'Info'];

export function getFindingFilterKinds(): FindingFilterKind[] {
  return FILTER_KIND_ORDER.slice();
}

export function getFindingFilterKindLabel(kind: FindingFilterKind): string {
  return FILTER_KIND_LABELS[kind];
}

export function applyFindingFilters(
  findings: Finding[],
  filters: FindingFilterState
): Finding[] {
  return findings.filter((finding) =>
    FILTER_KIND_ORDER.every((kind) => {
      const expected = filters[kind];
      if (!expected) {
        return true;
      }
      return getFindingFilterValue(finding, kind) === expected;
    })
  );
}

export function getFindingFilterOptions(
  findings: Finding[],
  filters: FindingFilterState,
  kind: FindingFilterKind
): FindingFilterOption[] {
  const scopedFindings = applyFindingFilters(findings, omitFindingFilter(filters, kind));
  const counts = new Map<string, { label: string; count: number; detail?: string }>();

  for (const finding of scopedFindings) {
    const option = toFindingFilterOption(kind, finding);
    if (!option) {
      continue;
    }

    const existing = counts.get(option.value);
    if (existing) {
      existing.count += 1;
      continue;
    }

    counts.set(option.value, {
      label: option.label,
      count: 1,
      detail: option.detail,
    });
  }

  return sortFindingFilterOptions(kind, counts);
}

export function describeFindingFilters(
  findings: Finding[],
  filters: FindingFilterState
): string | undefined {
  const parts = FILTER_KIND_ORDER.flatMap((kind) => {
    const value = filters[kind];
    if (!value) {
      return [];
    }
    return [`${getFindingFilterKindLabel(kind)}: ${getFindingFilterLabel(findings, kind, value)}`];
  });

  if (parts.length === 0) {
    return undefined;
  }

  return parts.join(' • ');
}

export function getFindingFilterDisplayLabel(
  findings: Finding[],
  kind: FindingFilterKind,
  value: string
): string {
  return getFindingFilterLabel(findings, kind, value);
}

export function createFilteredEmptyState(
  findings: Finding[],
  filters: FindingFilterState
): { label: string; description?: string } {
  return {
    label: 'No cached findings match the current filters.',
    description: describeFindingFilters(findings, filters),
  };
}

function getFindingFilterValue(
  finding: Finding,
  kind: FindingFilterKind
): string | undefined {
  return toFindingFilterOption(kind, finding)?.value;
}

function getFindingFilterLabel(
  findings: Finding[],
  kind: FindingFilterKind,
  value: string
): string {
  const matching = getFindingFilterOptions(findings, {}, kind).find((option) => option.value === value);
  return matching?.label || value;
}

function omitFindingFilter(
  filters: FindingFilterState,
  kindToOmit: FindingFilterKind
): FindingFilterState {
  const next: FindingFilterState = {};
  for (const kind of FILTER_KIND_ORDER) {
    if (kind === kindToOmit) {
      continue;
    }
    const value = filters[kind];
    if (value) {
      next[kind] = value;
    }
  }
  return next;
}

function toFindingFilterOption(
  kind: FindingFilterKind,
  finding: Finding
): Omit<FindingFilterOption, 'count'> | undefined {
  const facets = toFindingFacets(finding);
  const value = facets.filterValues[kind];
  if (!value) {
    return undefined;
  }

  if (kind === 'severity') {
    return {
      value,
      label: facets.severityLabel,
      detail:
        facets.severityKey === 'error'
          ? 'Rank 1-4'
          : facets.severityKey === 'warning'
            ? 'Rank 5-9'
            : 'Rank 10+ or unknown',
    };
  }

  if (kind === 'rule') {
    return {
      value,
      label: facets.ruleLabel,
      detail: value,
    };
  }

  const labelByKind: Record<Exclude<FindingFilterKind, 'severity' | 'rule'>, string> = {
    category: facets.categoryLabel,
    package: facets.packageLabel,
    class: facets.classLabel,
    path: facets.pathLabel,
  };
  return { value, label: labelByKind[kind] };
}

function sortFindingFilterOptions(
  kind: FindingFilterKind,
  counts: Map<string, { label: string; count: number; detail?: string }>
): FindingFilterOption[] {
  const options = Array.from(counts.entries()).map(([value, entry]) => ({
    value,
    label: entry.label,
    count: entry.count,
    detail: entry.detail,
  }));

  if (kind === 'severity') {
    return options.sort(
      (a, b) => SEVERITY_ORDER.indexOf(a.value) - SEVERITY_ORDER.indexOf(b.value)
    );
  }

  return options.sort((a, b) => {
    const labelCompare = a.label.localeCompare(b.label);
    if (labelCompare !== 0) {
      return labelCompare;
    }
    return a.value.localeCompare(b.value);
  });
}
