import { ThemeIcon, l10n } from 'vscode';
import * as path from 'path';
import { Finding } from '../model/finding';
import { formatFindingSummary, rankToSeverity } from '../formatters/findingFormatting';
import { toFindingFacets } from './findingFacets';

export interface FindingItemViewProps {
  label: string;
  description: string;
  tooltip: string;
  icon: ThemeIcon;
}

export function toFindingItemView(finding: Finding): FindingItemViewProps {
  const label = formatFindingSummary(finding);

  const facets = toFindingFacets(finding);
  const filePath = facets.pathKey;
  const fileName = filePath ? path.basename(filePath) : facets.pathLabel;
  const startLine =
    typeof finding.location.startLine === 'number' && finding.location.startLine > 0
      ? finding.location.startLine
      : undefined;
  const endLine =
    typeof finding.location.endLine === 'number' && finding.location.endLine > 0
      ? finding.location.endLine
      : undefined;
  const lineInfo =
    startLine !== undefined
      ? endLine !== undefined && endLine !== startLine
        ? `${startLine}-${endLine}`
        : `${startLine}`
      : '';
  const description = `${fileName}${lineInfo ? `:${lineInfo}` : ''} • ${facets.categoryLabel}`;
  const tooltip = [
    l10n.t('Pattern: {0}', facets.ruleLabel),
    l10n.t('Category: {0}', facets.categoryLabel),
    l10n.t('Priority: {0}', facets.priorityLabel),
    l10n.t('File: {0}', facets.pathLabel),
    lineInfo ? l10n.t('Line: {0}', lineInfo) : undefined,
  ]
    .filter((line): line is string => !!line)
    .join('\n');
  const icon = severityIcon(finding);
  return { label, description, tooltip, icon };
}

function severityIcon(finding: Finding): ThemeIcon {
  const severity = rankToSeverity(finding.rank);
  if (severity === 'error') return new ThemeIcon('error');
  if (severity === 'warning') return new ThemeIcon('warning');
  return new ThemeIcon('info');
}
