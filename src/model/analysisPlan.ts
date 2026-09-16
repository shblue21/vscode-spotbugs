import type { Uri } from 'vscode';
import type { AnalysisSettings } from '../core/config';
import type { AnalysisResolutionIssue } from '../lsp/javaLsOutcome';
import type { AnalysisExecutionUnit } from './analysisExecutionUnit';
import type { AnalysisOutcome } from './analysisOutcome';
import type { DiagnosticUpdateScope } from './diagnosticScope';

export interface AnalysisSelection {
  kind: 'source' | 'artifact' | 'project';
  resource: Uri;
  workspaceFolder?: Uri;
  includeBaselineXml?: boolean;
}
export interface PlannedAnalysisUnit extends AnalysisExecutionUnit {
  selectionIndex: number;
  resource: Uri;
  settings: AnalysisSettings;
  diagnosticScope?: DiagnosticUpdateScope;
}
export interface AnalysisPlan {
  selections: readonly AnalysisSelection[];
  units: readonly PlannedAnalysisUnit[];
  problems: readonly { selectionIndex: number; resource: Uri; outcome: AnalysisOutcome }[];
  resolutionIssues: readonly AnalysisResolutionIssue[];
  cancelled: boolean;
}
