import { Bug } from '../model/bug';
import { Finding, FindingLocation } from '../model/finding';

export function mapBugsToFindings(bugs: Bug[]): Finding[] {
  return bugs.map(mapBugToFinding);
}

export function mapBugToFinding(bug: Bug): Finding {
  const location: FindingLocation = {
    fullPath: bug.fullPath,
    realSourcePath: bug.realSourcePath,
    sourceFile: bug.sourceFile,
    startLine: bug.startLine,
    endLine: bug.endLine,
  };

  return {
    patternId: normalizePatternId(bug),
    type: bug.type,
    rank: bug.rank,
    priority: bug.priority,
    category: bug.category,
    abbrev: bug.abbrev,
    message: bug.message,
    location,
  };
}

function normalizePatternId(bug: Bug): string {
  const base = bug.abbrev || bug.type || 'Unknown';
  return base.toUpperCase();
}
