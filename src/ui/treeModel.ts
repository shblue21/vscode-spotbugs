import { Finding } from '../model/finding';
import { formatFindingPatternLabel } from '../formatters/findingFormatting';

export interface GroupedPattern {
  label: string;
  findings: Finding[];
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
    [category: string]: {
      [patternKey: string]: { label: string; findings: Finding[] };
    };
  } = {};

  for (const finding of findings) {
    const category = finding.category || 'Uncategorized';
    const patternKey = finding.patternId;
    if (!map[category]) {
      map[category] = {};
    }
    if (!map[category][patternKey]) {
      map[category][patternKey] = {
        label: formatFindingPatternLabel(finding),
        findings: [],
      };
    }
    map[category][patternKey].findings.push(finding);
  }

  return Object.keys(map)
    .sort()
    .map((category) => {
      const patternMap = map[category];
      const patterns = Object.keys(patternMap)
        .sort()
        .map((key) => {
          const entry = patternMap[key];
          return { label: entry.label, findings: entry.findings };
        });
      const total = patterns.reduce((acc, p) => acc + p.findings.length, 0);
      return { name: category, patterns, total };
    });
}
