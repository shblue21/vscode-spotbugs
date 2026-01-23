import { ThemeIcon } from 'vscode';
import * as path from 'path';
import { Bug } from '../model/bug';
import { formatBugSummary, rankToSeverity } from '../formatters/bugFormatting';

export interface BugItemViewProps {
  label: string;
  description: string;
  tooltip: string;
  icon: ThemeIcon;
}

export function toBugItemView(bug: Bug): BugItemViewProps {
  const label = formatBugSummary(bug);

  const filePath = bug.fullPath || bug.realSourcePath || bug.sourceFile;
  const fileName = filePath ? path.basename(filePath) : 'Unknown file';
  const lineInfo = bug.startLine && bug.endLine
    ? (bug.startLine === bug.endLine ? `${bug.startLine}` : `${bug.startLine}-${bug.endLine}`)
    : '';
  const description = `${fileName}${lineInfo ? `:${lineInfo}` : ''} • ${bug.category}`;
  const tooltip = `Pattern: ${bug.abbrev || bug.type}\nCategory: ${bug.category}\nPriority: ${bug.priority}\nFile: ${filePath}${lineInfo ? `\nLine: ${lineInfo}` : ''}`;
  const icon = severityIcon(bug);
  return { label, description, tooltip, icon };
}

function severityIcon(bug: Bug): ThemeIcon {
  const severity = rankToSeverity(bug.rank);
  if (severity === 'error') return new ThemeIcon('error');
  if (severity === 'warning') return new ThemeIcon('warning');
  return new ThemeIcon('info');
}
