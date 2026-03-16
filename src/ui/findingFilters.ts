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
const SEVERITY_ALIASES: Record<string, string> = {
  high: 'Error',
  medium: 'Warning',
  med: 'Warning',
  low: 'Info',
};

const SEVERITY_ORDER = ['Error', 'Warning', 'Info'];
const DEFAULT_PACKAGE_LABEL = '<default package>';
const FINDING_FILTER_QUERY_KEYS = new Set<FindingFilterKind>(FILTER_KIND_ORDER);

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
      return findingMatchesFilter(finding, kind, expected);
    })
  );
}

export function parseFindingFilterQuery(query: string): FindingFilterState {
  const filters: FindingFilterState = {};
  const input = query.trim();

  if (!input) {
    return filters;
  }

  let index = 0;
  while (index < input.length) {
    index = skipWhitespace(input, index);
    if (index >= input.length) {
      break;
    }

    const keyStart = index;
    while (index < input.length && /[A-Za-z]/.test(input[index])) {
      index += 1;
    }

    if (keyStart === index || input[index] !== ':') {
      throw new Error(
        `Invalid filter syntax near "${input.slice(keyStart)}". Use key:value terms.`
      );
    }

    const rawKey = input.slice(keyStart, index).toLowerCase();
    if (!isFindingFilterKind(rawKey)) {
      throw new Error(
        `Unsupported filter key "${rawKey}". Supported keys: ${FILTER_KIND_ORDER.join(', ')}.`
      );
    }

    index += 1;
    if (index >= input.length) {
      throw new Error(`Missing value for "${rawKey}:" filter.`);
    }

    const { value, nextIndex } = readFilterQueryValue(input, index, rawKey);
    filters[rawKey] = value;
    index = nextIndex;
  }

  return filters;
}

export function validateFindingFilterQuery(query: string): string | undefined {
  try {
    parseFindingFilterQuery(query);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export function formatFindingFilterQuery(filters: FindingFilterState): string {
  return FILTER_KIND_ORDER.flatMap((kind) => {
    const value = filters[kind];
    if (!value) {
      return [];
    }
    return [`${kind}:${quoteFindingFilterValue(value)}`];
  }).join(' ');
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

function findingMatchesFilter(
  finding: Finding,
  kind: FindingFilterKind,
  expected: string
): boolean {
  const normalizedExpected = normalizeFindingFilterInput(kind, expected);
  if (!normalizedExpected) {
    return true;
  }

  if (kind === 'severity') {
    const value = getFindingFilterValue(finding, kind);
    return value !== undefined && equalsIgnoreCase(value, normalizedExpected);
  }

  const option = toFindingFilterOption(kind, finding);
  if (!option) {
    return false;
  }

  const haystacks = getFindingFilterMatchTerms(finding, kind, option);

  const normalizedHaystacks =
    kind === 'path' ? haystacks.map((candidate) => normalizePathSeparators(candidate)) : haystacks;
  const comparableExpected =
    kind === 'path' ? normalizePathSeparators(normalizedExpected) : normalizedExpected;

  return normalizedHaystacks.some((candidate) => containsIgnoreCase(candidate, comparableExpected));
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

function normalizeFindingFilterInput(
  kind: FindingFilterKind,
  value: string
): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (kind !== 'severity') {
    return trimmed;
  }

  const alias = SEVERITY_ALIASES[trimmed.toLowerCase()];
  if (alias) {
    return alias;
  }

  const exact = SEVERITY_ORDER.find((label) => equalsIgnoreCase(label, trimmed));
  if (exact) {
    return exact;
  }

  const prefixMatches = SEVERITY_ORDER.filter((label) =>
    label.toLowerCase().startsWith(trimmed.toLowerCase())
  );

  if (prefixMatches.length === 1) {
    return prefixMatches[0];
  }

  return trimmed;
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

function isFindingFilterKind(value: string): value is FindingFilterKind {
  return FINDING_FILTER_QUERY_KEYS.has(value as FindingFilterKind);
}

function skipWhitespace(input: string, index: number): number {
  let next = index;
  while (next < input.length && /\s/.test(input[next])) {
    next += 1;
  }
  return next;
}

function readFilterQueryValue(
  input: string,
  index: number,
  key: FindingFilterKind
): { value: string; nextIndex: number } {
  if (input[index] === '"' || input[index] === "'") {
    return readQuotedFilterQueryValue(input, index, key);
  }

  let nextIndex = index;
  while (nextIndex < input.length && !/\s/.test(input[nextIndex])) {
    nextIndex += 1;
  }

  const rawValue = input.slice(index, nextIndex);
  const value = normalizeFindingFilterInput(key, rawValue);
  if (!value) {
    throw new Error(`Missing value for "${key}:" filter.`);
  }

  return { value, nextIndex };
}

function readQuotedFilterQueryValue(
  input: string,
  index: number,
  key: FindingFilterKind
): { value: string; nextIndex: number } {
  const quote = input[index];
  let cursor = index + 1;
  let value = '';

  while (cursor < input.length) {
    const char = input[cursor];
    if (char === '\\' && cursor + 1 < input.length) {
      const nextChar = input[cursor + 1];
      if (nextChar === quote || nextChar === '\\') {
        value += nextChar;
        cursor += 2;
        continue;
      }
    }
    if (char === quote) {
      const normalized = normalizeFindingFilterInput(key, value);
      if (!normalized) {
        throw new Error(`Missing value for "${key}:" filter.`);
      }
      return { value: normalized, nextIndex: cursor + 1 };
    }
    value += char;
    cursor += 1;
  }

  throw new Error(`Unterminated quoted value for "${key}:" filter.`);
}

function quoteFindingFilterValue(value: string): string {
  if (!/[\s"]/u.test(value)) {
    return value;
  }

  const escaped = value.replace(/["\\]/g, '\\$&');
  return `"${escaped}"`;
}

function containsIgnoreCase(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function equalsIgnoreCase(left: string, right: string): boolean {
  return left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0;
}

function normalizePathSeparators(value: string): string {
  return value.replace(/\\/g, '/');
}

function getFindingFilterMatchTerms(
  finding: Finding,
  kind: FindingFilterKind,
  option: Omit<FindingFilterOption, 'count'>
): string[] {
  const terms = [option.value, option.label, option.detail];

  if (kind === 'rule' && finding.type) {
    terms.push(finding.type);
  }

  return terms.filter((candidate): candidate is string => Boolean(candidate));
}
