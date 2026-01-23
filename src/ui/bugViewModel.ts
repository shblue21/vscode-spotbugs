import { ThemeIcon } from 'vscode';
import * as path from 'path';
import { Finding } from '../model/finding';
import { formatBugSummary, rankToSeverity } from '../formatters/bugFormatting';

export interface BugItemViewProps {
  label: string;
  description: string;
  tooltip: string;
  icon: ThemeIcon;
}

export function toBugItemView(finding: Finding): BugItemViewProps {
  const label = formatBugSummary(finding);

  const filePath =
    finding.location.fullPath ||
    finding.location.realSourcePath ||
    finding.location.sourceFile;
  const fileName = filePath ? path.basename(filePath) : 'Unknown file';
  const lineInfo = finding.location.startLine && finding.location.endLine
    ? (finding.location.startLine === finding.location.endLine
        ? `${finding.location.startLine}`
        : `${finding.location.startLine}-${finding.location.endLine}`)
    : '';
  const description = `${fileName}${lineInfo ? `:${lineInfo}` : ''} • ${finding.category}`;
  const tooltip = `Pattern: ${finding.abbrev || finding.type}\nCategory: ${finding.category}\nPriority: ${finding.priority}\nFile: ${filePath}${lineInfo ? `\nLine: ${lineInfo}` : ''}`;
  const icon = severityIcon(finding);
  return { label, description, tooltip, icon };
}

function severityIcon(finding: Finding): ThemeIcon {
  const severity = rankToSeverity(finding.rank);
  if (severity === 'error') return new ThemeIcon('error');
  if (severity === 'warning') return new ThemeIcon('warning');
  return new ThemeIcon('info');
}
