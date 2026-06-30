import type * as vscode from 'vscode';
import { formatFindingSummary } from '../formatters/findingFormatting';
import { Finding } from '../model/finding';
import { getAllowedWebDocumentationUrl } from '../services/spotbugsDocumentationLinks';
import { getFindingDescriptionTitle } from './findingDescriptionRenderer';
import { FindingInspectorSnapshot } from './findingInspectorState';

type Localize = (message: string, ...args: Array<string | number | boolean>) => string;
type LocalizationApi = {
  l10n: { t: Localize };
  readonly vscodeL10nType?: typeof vscode.l10n;
};

const fallbackVscode: LocalizationApi = {
  l10n: {
    t: formatFallback,
  },
};

export function renderFindingInspectorHtml(
  snapshot: FindingInspectorSnapshot,
  nonce: string,
  vscode: LocalizationApi = fallbackVscode
): string {
  const body =
    snapshot.status === 'empty'
      ? renderEmptyState(vscode)
      : renderFinding(snapshot.finding, snapshot.status, vscode);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${escapeAttribute(nonce)}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SpotBugs Inspector</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      margin: 0;
      padding: 12px;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      line-height: 1.4;
    }
    .state {
      margin-bottom: 6px;
      color: var(--vscode-descriptionForeground);
      font-size: 0.86em;
      text-transform: uppercase;
    }
    h2 {
      margin: 0 0 8px;
      font-size: 1em;
      line-height: 1.3;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    dl {
      display: grid;
      grid-template-columns: max-content minmax(0, 1fr);
      gap: 4px 8px;
      margin: 6px 0 0;
    }
    dt { color: var(--vscode-descriptionForeground); }
    dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
    .path { word-break: break-all; }
    h3 {
      margin: 12px 0 4px;
      font-size: 0.92em;
      font-weight: 600;
    }
    .reported-message {
      margin: 4px 0;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 10px;
    }
    button {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border: 0;
      padding: 4px 8px;
      cursor: pointer;
    }
    button.secondary {
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
    }
    .empty {
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  ${body}
  <script nonce="${escapeAttribute(nonce)}">
    const vscode = acquireVsCodeApi();
    document.addEventListener('click', (event) => {
      const target = event.target.closest('[data-command]');
      if (!target) {
        return;
      }
      vscode.postMessage({ type: target.getAttribute('data-command') });
    });
  </script>
</body>
</html>`;
}

function renderEmptyState(vscode: LocalizationApi): string {
  return `<p class="empty">${escapeHtml(vscode.l10n.t('Select a finding to inspect it.'))}</p>`;
}

function renderFinding(
  finding: Finding,
  status: 'selected' | 'retained',
  vscode: LocalizationApi
): string {
  const title = getFindingDescriptionTitle(finding);
  const stateLabel =
    status === 'retained'
      ? vscode.l10n.t('Last inspected finding')
      : vscode.l10n.t('Selected finding');
  const reportedMessage = formatReportedMessage(finding);
  const severity = formatSeverityLabel(finding, vscode);
  const location = formatLocation(finding, vscode);
  const docsAction = getAllowedWebDocumentationUrl(finding.helpUri, finding.type)
    ? `<button class="secondary" data-command="openDocs">${escapeHtml(vscode.l10n.t('Open docs'))}</button>`
    : '';

  return `<section>
    <div class="state">${escapeHtml(stateLabel)}</div>
    <h2 title="${escapeAttribute(title)}"><span class="severity" aria-label="${escapeAttribute(severity)}">!</span> ${escapeHtml(title)}</h2>
    <h3>${escapeHtml(vscode.l10n.t('Reported here'))}</h3>
    <p class="reported-message" title="${escapeAttribute(reportedMessage)}">${escapeHtml(reportedMessage)}</p>
    <dl>
      <dt>${escapeHtml(vscode.l10n.t('Location'))}</dt><dd class="path" title="${escapeAttribute(location)}">${escapeHtml(location)}</dd>
      ${finding.className ? `<dt>${escapeHtml(vscode.l10n.t('Class'))}</dt><dd title="${escapeAttribute(finding.className)}">${escapeHtml(finding.className)}</dd>` : ''}
      ${finding.methodName ? `<dt>${escapeHtml(vscode.l10n.t('Method'))}</dt><dd title="${escapeAttribute(finding.methodName)}">${escapeHtml(finding.methodName)}</dd>` : ''}
      ${finding.fieldName ? `<dt>${escapeHtml(vscode.l10n.t('Field'))}</dt><dd title="${escapeAttribute(finding.fieldName)}">${escapeHtml(finding.fieldName)}</dd>` : ''}
    </dl>
    <h3>${escapeHtml(vscode.l10n.t('Rule'))}</h3>
    <dl>
      <dt>${escapeHtml(vscode.l10n.t('Pattern'))}</dt><dd>${escapeHtml(finding.patternId)}</dd>
      ${finding.category ? `<dt>${escapeHtml(vscode.l10n.t('Category'))}</dt><dd>${escapeHtml(finding.category)}</dd>` : ''}
      ${finding.priority ? `<dt>${escapeHtml(vscode.l10n.t('Priority'))}</dt><dd>${escapeHtml(finding.priority)}</dd>` : ''}
      ${typeof finding.rank === 'number' ? `<dt>${escapeHtml(vscode.l10n.t('Rank'))}</dt><dd>${String(finding.rank)}</dd>` : ''}
      ${typeof finding.cweId === 'number' ? `<dt>CWE</dt><dd>${String(finding.cweId)}</dd>` : ''}
    </dl>
    <div class="actions">
      <button data-command="revealSource">${escapeHtml(vscode.l10n.t('Go to code'))}</button>
      <button data-command="openDetails">${escapeHtml(vscode.l10n.t('Open details'))}</button>
      <button class="secondary" data-command="copyRuleId">${escapeHtml(vscode.l10n.t('Copy rule id'))}</button>
      ${docsAction}
    </div>
  </section>`;
}

function formatReportedMessage(finding: Finding): string {
  const message = finding.message?.trim();
  if (message) {
    return message;
  }
  return formatFindingSummary(finding);
}

function formatSeverityLabel(finding: Finding, vscode: LocalizationApi): string {
  if (finding.priority) {
    return vscode.l10n.t('Priority {0}', finding.priority);
  }
  if (typeof finding.rank === 'number') {
    return vscode.l10n.t('Rank {0}', finding.rank);
  }
  return vscode.l10n.t('SpotBugs finding');
}

function formatLocation(finding: Finding, vscode: LocalizationApi): string {
  const file =
    finding.location.realSourcePath ??
    finding.location.fullPath ??
    finding.location.sourceFile ??
    vscode.l10n.t('Unknown source');
  const start = finding.location.startLine;
  const end = finding.location.endLine;

  if (typeof start !== 'number') {
    return file;
  }
  if (typeof end === 'number' && end !== start) {
    return `${file}:${start}-${end}`;
  }
  return `${file}:${start}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

function formatFallback(
  message: string,
  ...args: Array<string | number | boolean>
): string {
  return message.replace(/\{(\d+)\}/g, (placeholder, indexValue: string) => {
    const index = Number(indexValue);
    return index < args.length ? String(args[index]) : placeholder;
  });
}
