import { Bug } from '../model/bug';
import { formatPatternLabel } from '../formatters/bugFormatting';

export interface GroupedPattern {
  label: string;
  bugs: Bug[];
}

export interface GroupedCategory {
  name: string;
  patterns: GroupedPattern[];
  total: number;
}

export function groupBugsByCategoryAndPattern(bugs: Bug[]): GroupedCategory[] {
  const map: {
    [category: string]: { [patternKey: string]: { label: string; bugs: Bug[] } };
  } = {};

  for (const bug of bugs) {
    const category = bug.category || 'Uncategorized';
    const patternKey = (bug.abbrev || bug.type || 'Unknown').toUpperCase();
    if (!map[category]) {
      map[category] = {};
    }
    if (!map[category][patternKey]) {
      map[category][patternKey] = { label: formatPatternLabel(bug), bugs: [] };
    }
    map[category][patternKey].bugs.push(bug);
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
