import { Finding } from '../model/finding';
import {
  FindingFacets,
  FindingGroupKind,
  MISSING_GROUP_KEYS,
  groupKeyFor,
  toFindingFacets,
} from './findingFacets';

export type FindingSortKind = 'severityRank' | 'pathLine' | 'rule';

export type FindingResultNode = FindingResultGroup | FindingResultLeaf;

export interface FindingResultGroup {
  type: 'group';
  groupKind: FindingGroupKind;
  key: string;
  label: string;
  total: number;
  findings: Finding[];
  children: FindingResultNode[];
}

export interface FindingResultLeaf {
  type: 'finding';
  finding: Finding;
}

export interface ResultViewState {
  searchQuery: string;
  groupBy: FindingGroupKind;
  sortBy: FindingSortKind;
}

export interface ResultView {
  visibleFindings: Finding[];
  nodes: FindingResultNode[];
}

type FindingWithFacets = {
  finding: Finding;
  facets: FindingFacets;
  originalIndex: number;
};

type GroupLabelCache = Map<string, string>;

export function buildResultView(
  findings: Finding[],
  state: ResultViewState
): ResultView {
  const searchedEntries = findings
    .map((finding, originalIndex) => ({
      finding,
      facets: toFindingFacets(finding),
      originalIndex,
    }))
    .filter((entry) => matchesSearch(entry.facets, state.searchQuery));
  const labelCache = createGroupLabelCache(searchedEntries);
  const sortedEntries = sortEntries(searchedEntries, state.sortBy);

  return {
    visibleFindings: sortedEntries.map((entry) => entry.finding),
    nodes: buildGroups(sortedEntries, state.groupBy, labelCache),
  };
}

export function applySearch(findings: Finding[], query: string): Finding[] {
  return findings.filter((finding) => matchesFindingSearch(finding, query));
}

export function matchesFindingSearch(finding: Finding, query: string): boolean {
  return matchesSearch(toFindingFacets(finding), query);
}

export function sortFindings(
  findings: Finding[],
  sortBy: FindingSortKind
): Finding[] {
  return sortEntries(
    findings.map((finding, originalIndex) => ({
      finding,
      facets: toFindingFacets(finding),
      originalIndex,
    })),
    sortBy
  ).map((entry) => entry.finding);
}

function matchesSearch(facets: FindingFacets, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) {
    return true;
  }
  return facets.searchableValues.some((value) =>
    value.toLowerCase().includes(needle)
  );
}

function buildGroups(
  entries: FindingWithFacets[],
  groupBy: FindingGroupKind,
  labelCache: GroupLabelCache
): FindingResultNode[] {
  if (groupBy === 'category') {
    return buildCategoryRuleGroups(entries, labelCache);
  }
  return buildSingleLevelGroups(entries, groupBy, labelCache);
}

function buildCategoryRuleGroups(
  entries: FindingWithFacets[],
  labelCache: GroupLabelCache
): FindingResultGroup[] {
  const categoryGroups = groupEntries(entries, 'category', labelCache);
  return categoryGroups.map((category): FindingResultGroup => {
    const ruleGroups = buildSingleLevelGroups(
      category.entries,
      'rule',
      labelCache
    ) as FindingResultGroup[];
    return {
      type: 'group',
      groupKind: 'category',
      key: category.key,
      label: category.label,
      total: category.entries.length,
      findings: category.entries.map((entry) => entry.finding),
      children: ruleGroups,
    };
  });
}

function buildSingleLevelGroups(
  entries: FindingWithFacets[],
  groupBy: FindingGroupKind,
  labelCache: GroupLabelCache
): FindingResultGroup[] {
  return groupEntries(entries, groupBy, labelCache).map((group): FindingResultGroup => {
    return {
      type: 'group',
      groupKind: groupBy,
      key: group.key,
      label: group.label,
      total: group.entries.length,
      findings: group.entries.map((entry) => entry.finding),
      children: group.entries.map((entry) => ({
        type: 'finding',
        finding: entry.finding,
      })),
    };
  });
}

function sortEntries(
  entries: FindingWithFacets[],
  sortBy: FindingSortKind
): FindingWithFacets[] {
  return entries
    .slice()
    .sort(
      (left, right) =>
        compareFindingEntries(left, right, sortBy) ||
        left.originalIndex - right.originalIndex
    );
}

function createGroupLabelCache(entries: FindingWithFacets[]): GroupLabelCache {
  const cache: GroupLabelCache = new Map();
  const groupKinds: FindingGroupKind[] = [
    'category',
    'package',
    'class',
    'path',
    'priority',
    'rule',
  ];
  for (const groupBy of groupKinds) {
    for (const entry of entries) {
      const key = groupKeyFor(groupBy, entry.facets);
      const cacheKey = groupLabelCacheKey(groupBy, key);
      if (!cache.has(cacheKey)) {
        cache.set(cacheKey, groupLabelFor(groupBy, entry.facets));
      }
    }
  }
  return cache;
}

function groupEntries(
  entries: FindingWithFacets[],
  groupBy: FindingGroupKind,
  labelCache: GroupLabelCache
): Array<{
  key: string;
  label: string;
  firstIndex: number;
  entries: FindingWithFacets[];
}> {
  const groups = new Map<
    string,
    { label: string; firstIndex: number; entries: FindingWithFacets[] }
  >();
  for (const entry of entries) {
    const key = groupKeyFor(groupBy, entry.facets);
    const label =
      labelCache.get(groupLabelCacheKey(groupBy, key)) ??
      groupLabelFor(groupBy, entry.facets);
    const group = groups.get(key) ?? {
      label,
      firstIndex: entry.originalIndex,
      entries: [],
    };
    group.firstIndex = Math.min(group.firstIndex, entry.originalIndex);
    group.entries.push(entry);
    groups.set(key, group);
  }

  return Array.from(groups.entries())
    .map(([key, value]) => ({
      key,
      label: value.label,
      firstIndex: value.firstIndex,
      entries: value.entries,
    }))
    .sort((left, right) =>
      compareGroups(
        groupBy,
        left.label,
        right.label,
        left.key,
        right.key,
        left.firstIndex,
        right.firstIndex
      )
    );
}

function groupLabelCacheKey(groupBy: FindingGroupKind, key: string): string {
  return `${groupBy}:${key}`;
}

function groupLabelFor(groupBy: FindingGroupKind, facets: FindingFacets): string {
  if (groupBy === 'category') {
    return facets.categoryLabel;
  }
  if (groupBy === 'package') {
    return facets.packageLabel;
  }
  if (groupBy === 'class') {
    return facets.classLabel;
  }
  if (groupBy === 'path') {
    return facets.pathLabel;
  }
  if (groupBy === 'priority') {
    return facets.priorityLabel;
  }
  return facets.ruleLabel;
}

function compareGroups(
  groupBy: FindingGroupKind,
  leftLabel: string,
  rightLabel: string,
  leftKey: string,
  rightKey: string,
  leftFirstIndex: number,
  rightFirstIndex: number
): number {
  if (groupBy === 'priority') {
    const priorityOrder = ['high', 'medium', 'low', MISSING_GROUP_KEYS.priority];
    const leftIndex = priorityOrder.indexOf(leftKey);
    const rightIndex = priorityOrder.indexOf(rightKey);
    if (leftIndex !== rightIndex) {
      return normalizeGroupOrderIndex(leftIndex) - normalizeGroupOrderIndex(rightIndex);
    }
  }

  if (groupBy === 'rule') {
    const keyCompare = compareGroupKeyWithMissingLast(
      leftKey,
      rightKey,
      MISSING_GROUP_KEYS.rule
    );
    if (keyCompare !== 0) {
      return keyCompare;
    }
    if (leftKey !== rightKey) {
      return leftFirstIndex - rightFirstIndex;
    }
  }

  const labelCompare = compareText(leftLabel, rightLabel);
  if (labelCompare !== 0) {
    return labelCompare;
  }
  const keyCompare = compareText(leftKey, rightKey);
  return keyCompare !== 0 ? keyCompare : leftFirstIndex - rightFirstIndex;
}

function normalizeGroupOrderIndex(index: number): number {
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

function compareGroupKeyWithMissingLast(
  leftKey: string,
  rightKey: string,
  missingKey: string
): number {
  const left = leftKey === missingKey ? undefined : leftKey;
  const right = rightKey === missingKey ? undefined : rightKey;
  return compareTextWithMissingLast(left, right);
}

function compareFindingEntries(
  left: FindingWithFacets,
  right: FindingWithFacets,
  sortBy: FindingSortKind
): number {
  if (sortBy === 'pathLine') {
    return comparePathLine(left, right) || compareRank(left, right) || compareRule(left, right);
  }
  if (sortBy === 'rule') {
    return compareRule(left, right) || compareRank(left, right) || comparePathLine(left, right);
  }
  return compareRank(left, right) || comparePathLine(left, right) || compareRule(left, right);
}

function compareRank(left: FindingWithFacets, right: FindingWithFacets): number {
  const leftRank = rankSortKey(left.finding.rank);
  const rightRank = rankSortKey(right.finding.rank);
  return leftRank - rightRank;
}

function rankSortKey(rank?: number): number {
  return typeof rank === 'number' && rank >= 1 && rank <= 20
    ? rank
    : Number.MAX_SAFE_INTEGER;
}

function comparePathLine(left: FindingWithFacets, right: FindingWithFacets): number {
  const pathCompare = compareTextWithMissingLast(
    left.facets.pathKey,
    right.facets.pathKey
  );
  if (pathCompare !== 0) {
    return pathCompare;
  }
  const leftLine = knownLineOrLast(left.finding.location.startLine);
  const rightLine = knownLineOrLast(right.finding.location.startLine);
  return leftLine - rightLine;
}

function compareRule(left: FindingWithFacets, right: FindingWithFacets): number {
  const leftRule = concreteRuleSortKey(left);
  const rightRule = concreteRuleSortKey(right);
  return compareTextWithMissingLast(leftRule, rightRule);
}

function concreteRuleSortKey(entry: FindingWithFacets): string | undefined {
  const ruleKey = entry.facets.ruleKey;
  return ruleKey === 'Unknown rule' ? undefined : ruleKey;
}

function knownLineOrLast(line?: number): number {
  return typeof line === 'number' && line > 0 ? line : Number.MAX_SAFE_INTEGER;
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, undefined, { sensitivity: 'base' });
}

function compareTextWithMissingLast(left?: string, right?: string): number {
  if (!left && !right) {
    return 0;
  }
  if (!left) {
    return 1;
  }
  if (!right) {
    return -1;
  }
  return compareText(left, right);
}
