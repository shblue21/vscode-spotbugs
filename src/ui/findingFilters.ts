import { formatFindingPatternLabel, rankToSeverity } from '../formatters/findingFormatting';
import { Finding } from '../model/finding';

export type FindingFilterKind =
  | 'severity'
  | 'category'
  | 'package'
  | 'class'
  | 'path'
  | 'rule';

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

const SEVERITY_LABELS: Record<'error' | 'warning' | 'info', string> = {
  error: 'Error',
  warning: 'Warning',
  info: 'Info',
};

const SEVERITY_ORDER = ['Error', 'Warning', 'Info'];
const DEFAULT_PACKAGE_LABEL = '<default package>';

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
  if (kind === 'severity') {
    const severity = rankToSeverity(finding.rank);
    return {
      value: SEVERITY_LABELS[severity],
      label: SEVERITY_LABELS[severity],
      detail:
        severity === 'error'
          ? 'Rank 1-4'
          : severity === 'warning'
            ? 'Rank 5-9'
            : 'Rank 10+ or unknown',
    };
  }

  if (kind === 'category') {
    const category = finding.category || 'Uncategorized';
    return { value: category, label: category };
  }

  if (kind === 'package') {
    const packageName = extractPackageName(finding);
    if (!packageName) {
      return undefined;
    }
    return { value: packageName, label: packageName };
  }

  if (kind === 'class') {
    const className = finding.className;
    if (!className) {
      return undefined;
    }
    return { value: className, label: className };
  }

  if (kind === 'path') {
    const filePath =
      finding.location.fullPath || finding.location.realSourcePath || finding.location.sourceFile;
    if (!filePath) {
      return undefined;
    }
    return { value: filePath, label: filePath };
  }

  const ruleValue = finding.patternId;
  if (!ruleValue) {
    return undefined;
  }
  return {
    value: ruleValue,
    label: formatFindingPatternLabel(finding),
    detail: ruleValue,
  };
}

function extractPackageName(finding: Finding): string | undefined {
  if (finding.className) {
    const lastDot = finding.className.lastIndexOf('.');
    if (lastDot < 0) {
      return DEFAULT_PACKAGE_LABEL;
    }
    return finding.className.substring(0, lastDot);
  }

  const relativePath = finding.location.realSourcePath;
  if (!relativePath) {
    return undefined;
  }

  const normalized = relativePath.replace(/\\/g, '/');
  const slashIndex = normalized.lastIndexOf('/');
  if (slashIndex < 0) {
    return DEFAULT_PACKAGE_LABEL;
  }
  return normalized.substring(0, slashIndex).replace(/\//g, '.');
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
