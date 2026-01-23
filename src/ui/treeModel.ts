import { Finding } from '../model/finding';
import { formatPatternLabel } from '../formatters/bugFormatting';

export interface GroupedPattern {
  label: string;
  bugs: Finding[];
}

export interface GroupedCategory {
  name: string;
  patterns: GroupedPattern[];
  total: number;
}

export function groupFindingsByCategoryAndPattern(
  findings: Finding[]
): GroupedCategory[] {
  const map: {
    [category: string]: { [patternKey: string]: { label: string; bugs: Finding[] } };
  } = {};

  for (const finding of findings) {
    const category = finding.category || 'Uncategorized';
    const patternKey = finding.patternId;
    if (!map[category]) {
      map[category] = {};
    }
    if (!map[category][patternKey]) {
      map[category][patternKey] = { label: formatPatternLabel(finding), bugs: [] };
    }
    map[category][patternKey].bugs.push(finding);
  }

  return Object.keys(map)
    .sort()
    .map((category) => {
      const patternMap = map[category];
      const patterns = Object.keys(patternMap)
        .sort()
        .map((key) => {
          const entry = patternMap[key];
          return { label: entry.label, bugs: entry.bugs };
        });
      const total = patterns.reduce((acc, p) => acc + p.bugs.length, 0);
      return { name: category, patterns, total };
    });
}
