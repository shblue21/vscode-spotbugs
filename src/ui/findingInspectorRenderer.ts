import { formatFindingSummary } from '../formatters/findingFormatting';
import { Finding } from '../model/finding';
import { getAllowedWebDocumentationUrl } from '../services/spotbugsDocumentationLinks';
import { getFindingDescriptionTitle } from './findingDescriptionRenderer';
import { FindingInspectorSnapshot } from './findingInspectorState';

export function renderFindingInspectorHtml(
  snapshot: FindingInspectorSnapshot,
  nonce: string
): string {
  const body =
    snapshot.status === 'empty'
      ? renderEmptyState()
      : renderFinding(snapshot.finding, snapshot.status);

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

function renderEmptyState(): string {
  return '<p class="empty">Select a finding to inspect it.</p>';
}

function renderFinding(
  finding: Finding,
  status: 'selected' | 'retained'
): string {
  const title = getFindingDescriptionTitle(finding);
  const stateLabel =
    status === 'retained' ? 'Last inspected finding' : 'Selected finding';
  const reportedMessage = formatReportedMessage(finding);
  const severity = formatSeverityLabel(finding);
  const location = formatLocation(finding);
  const docsAction = getAllowedWebDocumentationUrl(finding.helpUri, finding.type)
    ? '<button class="secondary" data-command="openDocs">Open docs</button>'
    : '';

  return `<section>
    <div class="state">${escapeHtml(stateLabel)}</div>
    <h2 title="${escapeAttribute(title)}"><span class="severity" aria-label="${escapeAttribute(severity)}">!</span> ${escapeHtml(title)}</h2>
    <h3>Reported here</h3>
    <p class="reported-message" title="${escapeAttribute(reportedMessage)}">${escapeHtml(reportedMessage)}</p>
    <dl>
      <dt>Location</dt><dd class="path" title="${escapeAttribute(location)}">${escapeHtml(location)}</dd>
      ${finding.className ? `<dt>Class</dt><dd title="${escapeAttribute(finding.className)}">${escapeHtml(finding.className)}</dd>` : ''}
      ${finding.methodName ? `<dt>Method</dt><dd title="${escapeAttribute(finding.methodName)}">${escapeHtml(finding.methodName)}</dd>` : ''}
      ${finding.fieldName ? `<dt>Field</dt><dd title="${escapeAttribute(finding.fieldName)}">${escapeHtml(finding.fieldName)}</dd>` : ''}
    </dl>
    <h3>Rule</h3>
    <dl>
      <dt>Pattern</dt><dd>${escapeHtml(finding.patternId)}</dd>
      ${finding.category ? `<dt>Category</dt><dd>${escapeHtml(finding.category)}</dd>` : ''}
      ${finding.priority ? `<dt>Priority</dt><dd>${escapeHtml(finding.priority)}</dd>` : ''}
      ${typeof finding.rank === 'number' ? `<dt>Rank</dt><dd>${String(finding.rank)}</dd>` : ''}
      ${typeof finding.cweId === 'number' ? `<dt>CWE</dt><dd>${String(finding.cweId)}</dd>` : ''}
    </dl>
    <div class="actions">
      <button data-command="revealSource">Go to code</button>
      <button data-command="openDetails">Open details</button>
      <button class="secondary" data-command="copyRuleId">Copy rule id</button>
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

function formatSeverityLabel(finding: Finding): string {
  if (finding.priority) {
    return `Priority ${finding.priority}`;
  }
  if (typeof finding.rank === 'number') {
    return `Rank ${finding.rank}`;
  }
  return 'SpotBugs finding';
}

function formatLocation(finding: Finding): string {
  const file =
    finding.location.realSourcePath ??
    finding.location.fullPath ??
    finding.location.sourceFile ??
    'Unknown source';
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
