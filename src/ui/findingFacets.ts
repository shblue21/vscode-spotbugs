import {
  formatFindingPatternLabel,
  rankToSeverity,
} from '../formatters/findingFormatting';
import { Finding } from '../model/finding';

export type FindingFacetFilterKind =
  | 'severity'
  | 'category'
  | 'package'
  | 'class'
  | 'path'
  | 'rule';

export type FindingGroupKind =
  | 'category'
  | 'package'
  | 'class'
  | 'path'
  | 'priority'
  | 'rule';

export const MISSING_GROUP_KEYS: Record<FindingGroupKind, string> = {
  category: '__missing_category__',
  package: '__missing_package__',
  class: '__missing_class__',
  path: '__missing_path__',
  priority: '__missing_priority__',
  rule: '__missing_rule__',
};

export interface FindingFacets {
  categoryKey: string;
  categoryGroupKey: string;
  categoryLabel: string;
  packageKey?: string;
  packageLabel: string;
  classKey?: string;
  classLabel: string;
  pathKey?: string;
  pathLabel: string;
  priorityKey: 'high' | 'medium' | 'low' | 'unknown';
  priorityLabel: 'High' | 'Medium' | 'Low' | 'Unknown priority';
  severityKey: 'error' | 'warning' | 'info';
  severityLabel: 'Error' | 'Warning' | 'Info';
  ruleKey: string;
  ruleLabel: string;
  filterValues: Partial<Record<FindingFacetFilterKind, string>>;
  searchableValues: string[];
}

export function toFindingFacets(finding: Finding): FindingFacets {
  const rawCategory = valueOrUndefined(finding.category);
  const categoryKey = rawCategory ?? 'Uncategorized';
  const categoryGroupKey = rawCategory ?? MISSING_GROUP_KEYS.category;
  const categoryLabel = categoryKey;
  const packageKey = extractPackageName(finding);
  const classKey = valueOrUndefined(finding.className);
  const pathKey = firstDefined(
    finding.location.fullPath,
    finding.location.realSourcePath,
    finding.location.sourceFile
  );
  const priority = normalizePriority(finding.priority, finding.rank);
  const severityKey = rankToSeverity(finding.rank);
  const severityLabel =
    severityKey === 'error' ? 'Error' : severityKey === 'warning' ? 'Warning' : 'Info';
  const ruleFilterValue = concreteRuleFilterValue(finding);
  const ruleKey = concreteRuleKey(finding) ?? 'Unknown rule';
  const ruleLabel =
    ruleKey === 'Unknown rule' ? 'Unknown rule' : formatFindingPatternLabel(finding);
  const filterValues: Partial<Record<FindingFacetFilterKind, string>> = {
    severity: severityLabel,
    category: categoryLabel,
    rule: ruleFilterValue,
  };

  if (packageKey) {
    filterValues.package = packageKey;
  }
  if (classKey) {
    filterValues.class = classKey;
  }
  if (pathKey) {
    filterValues.path = pathKey;
  }

  const searchableValues = [
    ruleFilterValue,
    finding.type,
    finding.abbrev,
    finding.message,
    finding.shortDescription,
    finding.longDescription,
    categoryKey,
    categoryLabel,
    ruleKey,
    ruleLabel,
    finding.priority,
    priority.label,
    typeof finding.rank === 'number' ? String(finding.rank) : undefined,
    packageKey,
    packageKey ?? 'Unknown package',
    classKey,
    classKey ?? 'Unknown class',
    finding.methodName,
    finding.fieldName,
    pathKey,
    pathKey ?? 'Unknown source',
    finding.location.fullPath,
    finding.location.realSourcePath,
    finding.location.sourceFile,
    typeof finding.cweId === 'number' ? `CWE-${finding.cweId}` : undefined,
    typeof finding.cweId === 'number' ? String(finding.cweId) : undefined,
  ].flatMap((value) => {
    const normalized = valueOrUndefined(value);
    return normalized ? [normalized] : [];
  });

  return {
    categoryKey,
    categoryGroupKey,
    categoryLabel,
    packageKey,
    packageLabel: packageKey ?? 'Unknown package',
    classKey,
    classLabel: classKey ?? 'Unknown class',
    pathKey,
    pathLabel: pathKey ?? 'Unknown source',
    priorityKey: priority.key,
    priorityLabel: priority.label,
    severityKey,
    severityLabel,
    ruleKey,
    ruleLabel,
    filterValues,
    searchableValues,
  };
}

export function groupKeyFor(kind: FindingGroupKind, facets: FindingFacets): string {
  if (kind === 'category') {
    return facets.categoryGroupKey;
  }
  if (kind === 'package') {
    return facets.packageKey ?? MISSING_GROUP_KEYS.package;
  }
  if (kind === 'class') {
    return facets.classKey ?? MISSING_GROUP_KEYS.class;
  }
  if (kind === 'path') {
    return facets.pathKey ?? MISSING_GROUP_KEYS.path;
  }
  if (kind === 'priority') {
    return facets.priorityKey === 'unknown'
      ? MISSING_GROUP_KEYS.priority
      : facets.priorityKey;
  }
  return facets.ruleKey === 'Unknown rule' ? MISSING_GROUP_KEYS.rule : facets.ruleKey;
}

export function normalizePriority(
  rawPriority?: string,
  rank?: number
): {
  key: 'high' | 'medium' | 'low' | 'unknown';
  label: 'High' | 'Medium' | 'Low' | 'Unknown priority';
} {
  const normalized = rawPriority?.trim().toLowerCase();
  if (normalized === 'high' || normalized === 'h' || normalized === '1') {
    return { key: 'high', label: 'High' };
  }
  if (normalized === 'medium' || normalized === 'm' || normalized === '2') {
    return { key: 'medium', label: 'Medium' };
  }
  if (normalized === 'low' || normalized === 'l' || normalized === '3') {
    return { key: 'low', label: 'Low' };
  }
  if (typeof rank === 'number') {
    if (rank >= 1 && rank <= 4) {
      return { key: 'high', label: 'High' };
    }
    if (rank >= 5 && rank <= 9) {
      return { key: 'medium', label: 'Medium' };
    }
    if (rank >= 10 && rank <= 20) {
      return { key: 'low', label: 'Low' };
    }
  }
  return { key: 'unknown', label: 'Unknown priority' };
}

function extractPackageName(finding: Finding): string | undefined {
  const className = valueOrUndefined(finding.className);
  if (className) {
    const lastDot = className.lastIndexOf('.');
    return lastDot < 0 ? '<default package>' : className.substring(0, lastDot);
  }

  const relativePath = valueOrUndefined(finding.location.realSourcePath);
  if (!relativePath) {
    return undefined;
  }
  const normalized = relativePath.replace(/\\/g, '/');
  const slashIndex = normalized.lastIndexOf('/');
  return slashIndex < 0
    ? '<default package>'
    : normalized.substring(0, slashIndex).replace(/\//g, '.');
}

function concreteRuleKey(finding: Finding): string | undefined {
  const type = valueOrUndefined(finding.type);
  if (type) {
    return type;
  }
  const patternId = concreteRuleFilterValue(finding);
  if (patternId) {
    return patternId;
  }
  return valueOrUndefined(finding.abbrev);
}

function concreteRuleFilterValue(finding: Finding): string | undefined {
  const patternId = valueOrUndefined(finding.patternId);
  if (!patternId) {
    return undefined;
  }
  const hasExplicitRule =
    !!valueOrUndefined(finding.type) || !!valueOrUndefined(finding.abbrev);
  if (patternId.toUpperCase() === 'UNKNOWN' && !hasExplicitRule) {
    return undefined;
  }
  return patternId;
}

function firstDefined(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const normalized = valueOrUndefined(value);
    if (normalized) {
      return normalized;
    }
  }
  return undefined;
}

function valueOrUndefined(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}
