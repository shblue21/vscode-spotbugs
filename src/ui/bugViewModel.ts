import { BugInfo } from '../models/bugInfo';
import { ThemeIcon } from 'vscode';
import * as path from 'path';

export interface BugItemViewProps {
  label: string;
  description: string;
  tooltip: string;
  icon: ThemeIcon;
}

export function toBugItemView(bug: BugInfo): BugItemViewProps {
  const pattern = bug.abbrev || bug.type || 'Bug';
  const raw = bug.message || '';
  let msg = raw.trim();
  const prefix = `${pattern}:`;
  if (msg.toUpperCase().startsWith(prefix.toUpperCase())) {
    msg = msg.substring(prefix.length).trim();
  }
  const inIdx = msg.indexOf(' in ');
  if (inIdx > 0) {
    msg = msg.substring(0, inIdx).trim();
  }
  if (!msg) {
    msg = bug.type || 'SpotBugs finding';
  }
  const label = `[${pattern}] ${msg}`;

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

function severityIcon(bug: BugInfo): ThemeIcon {
  const rank = typeof bug.rank === 'number' ? bug.rank : 20;
  if (rank <= 4) return new ThemeIcon('error');
  if (rank <= 9) return new ThemeIcon('warning');
  return new ThemeIcon('info');
}

