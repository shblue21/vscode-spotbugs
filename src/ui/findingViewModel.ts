import { ThemeIcon } from 'vscode';
import * as path from 'path';
import { Finding } from '../model/finding';
import { formatFindingSummary, rankToSeverity } from '../formatters/findingFormatting';

export interface FindingItemViewProps {
  label: string;
  description: string;
  tooltip: string;
  icon: ThemeIcon;
}

export function toFindingItemView(finding: Finding): FindingItemViewProps {
  const label = formatFindingSummary(finding);

  const filePath =
    finding.location.fullPath ||
    finding.location.realSourcePath ||
    finding.location.sourceFile;
  const fileName = filePath ? path.basename(filePath) : 'Unknown file';
  const startLine =
    typeof finding.location.startLine === 'number' ? finding.location.startLine : undefined;
  const endLine =
    typeof finding.location.endLine === 'number' ? finding.location.endLine : undefined;
  const lineInfo =
    startLine !== undefined
      ? endLine !== undefined && endLine !== startLine
        ? `${startLine}-${endLine}`
        : `${startLine}`
      : '';
  const categoryLabel = finding.category || 'Uncategorized';
  const patternLabel = finding.abbrev || finding.type || 'Unknown';
  const priorityLabel = finding.priority || 'Unknown';
  const filePathLabel = filePath || 'Unknown file';
  const description = `${fileName}${lineInfo ? `:${lineInfo}` : ''} • ${categoryLabel}`;
  const tooltip = `Pattern: ${patternLabel}\nCategory: ${categoryLabel}\nPriority: ${priorityLabel}\nFile: ${filePathLabel}${lineInfo ? `\nLine: ${lineInfo}` : ''}`;
  const icon = severityIcon(finding);
  return { label, description, tooltip, icon };
}

function severityIcon(finding: Finding): ThemeIcon {
  const severity = rankToSeverity(finding.rank);
  if (severity === 'error') return new ThemeIcon('error');
  if (severity === 'warning') return new ThemeIcon('warning');
  return new ThemeIcon('info');
}
