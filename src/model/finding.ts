export type SourceLocationOrigin =
  | 'directSourceLine'
  | 'primaryMethod'
  | 'primaryField'
  | 'primaryClass'
  | 'unknown';

export interface FindingLocation {
  fullPath?: string;
  realSourcePath?: string;
  sourceFile?: string;
  startLine?: number;
  endLine?: number;
  locationOrigin?: SourceLocationOrigin;
}

export interface Finding {
  patternId: string;
  type?: string;
  rank?: number;
  priority?: string;
  category?: string;
  abbrev?: string;
  message?: string;
  longMessage?: string;
  categoryDescription?: string;
  annotationMessages?: string[];
  shortDescription?: string;
  longDescription?: string;
  detailHtml?: string;
  helpUri?: string;
  categoryAbbrev?: string;
  cweId?: number;
  instanceHash?: string;
  className?: string;
  methodName?: string;
  methodSignature?: string;
  fieldName?: string;
  location: FindingLocation;
}

export function getFindingSourcePath(finding: Pick<Finding, 'location'>): string | undefined {
  const candidates = [
    finding.location.fullPath,
    finding.location.realSourcePath,
    finding.location.sourceFile,
  ];
  for (const candidate of candidates) {
    const normalized = candidate?.trim();
    if (normalized) {
      return normalized;
    }
  }
  return undefined;
}

export type FindingSummary = Pick<Finding, 'type' | 'abbrev' | 'message'>;
