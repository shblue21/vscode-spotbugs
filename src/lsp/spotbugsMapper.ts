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
    longMessage: bug.longMessage,
    categoryDescription: bug.categoryDescription,
    annotationMessages: normalizeStringArray(bug.annotationMessages),
    shortDescription: bug.shortDescription,
    longDescription: bug.longDescription,
    detailHtml: bug.detailHtml,
    helpUri: bug.helpUri,
    categoryAbbrev: bug.categoryAbbrev,
    cweId: bug.cweId,
    instanceHash: bug.instanceHash,
    className: bug.className,
    methodName: bug.methodName,
    methodSignature: bug.methodSignature,
    fieldName: bug.fieldName,
    location,
  };
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const strings = value.filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0
  );
  return strings.length > 0 ? strings : undefined;
}

function normalizePatternId(bug: Bug): string {
  const base = bug.abbrev || bug.type || 'Unknown';
  return base.toUpperCase();
}
