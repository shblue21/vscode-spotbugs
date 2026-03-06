export interface Bug {
  type?: string;
  rank?: number;
  priority?: string;
  category?: string;
  abbrev?: string;
  message?: string;
  shortDescription?: string;
  longDescription?: string;
  helpUri?: string;
  categoryAbbrev?: string;
  cweId?: number;
  instanceHash?: string;
  className?: string;
  methodName?: string;
  methodSignature?: string;
  fieldName?: string;
  sourceFile?: string;
  startLine?: number;
  endLine?: number;
  realSourcePath?: string;
  fullPath?: string;
}
