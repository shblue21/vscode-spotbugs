export interface FindingLocation {
  fullPath?: string;
  realSourcePath?: string;
  sourceFile?: string;
  startLine?: number;
  endLine?: number;
}

export interface Finding {
  patternId: string;
  type?: string;
  rank?: number;
  priority?: string;
  category?: string;
  abbrev?: string;
  message?: string;
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

export type FindingSummary = Pick<Finding, 'type' | 'abbrev' | 'message'>;
