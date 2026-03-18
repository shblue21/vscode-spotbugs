import { formatFindingSummary } from '../formatters/findingFormatting';
import { Finding } from '../model/finding';
import {
  GENERIC_SPOTBUGS_DOCS_URI,
  rewriteLegacySpotBugsHelpUrl,
} from '../services/spotbugsDocumentationLinks';
import * as sanitizeHtml from 'sanitize-html';

const PANEL_TITLE = 'SpotBugs Details';
const DETAIL_HTML_ALLOWED_TAGS = [
  'p',
  'br',
  'code',
  'pre',
  'blockquote',
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
  'b',
  'strong',
  'i',
  'em',
  'tt',
  'sup',
  'sub',
  'a',
];
const DETAIL_HTML_ALLOWED_SCHEMES = ['http', 'https', 'mailto'];
const DETAIL_HTML_ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

export function renderFindingDescriptionHtml(finding: Finding): string {
  const title = getFindingDescriptionTitle(finding);
  const summary = formatFindingSummary(finding);
  const docsHref =
    getExternalDocsHref(finding.helpUri, finding.type) ??
    GENERIC_SPOTBUGS_DOCS_URI;
  const body = renderDescriptionBody(finding);
  const metadata = [
    finding.type ? ['Pattern', finding.type] : undefined,
    finding.category ? ['Category', finding.category] : undefined,
    finding.priority ? ['Priority', finding.priority] : undefined,
  ].filter((entry): entry is [string, string] => Array.isArray(entry));

  const metadataHtml = metadata
    .map(
      ([label, value]) =>
        `<li><span class="meta-label">${escapeHtml(label)}</span><span class="meta-value">${escapeHtml(value)}</span></li>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; img-src data:; style-src 'unsafe-inline';"
  >
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light dark;
    }

    body {
      margin: 0;
      padding: 0;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
      line-height: 1.55;
    }

    a {
      color: var(--vscode-textLink-foreground);
    }

    code,
    pre {
      font-family: var(--vscode-editor-font-family, monospace);
    }

    pre {
      white-space: pre-wrap;
      padding: 12px;
      overflow-x: auto;
      border-radius: 6px;
      background: var(--vscode-textBlockQuote-background);
    }

    header {
      padding: 16px 20px 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
      background:
        linear-gradient(
          180deg,
          color-mix(in srgb, var(--vscode-editorInfo-foreground) 10%, transparent),
          transparent
        );
    }

    h1 {
      margin: 0 0 8px;
      font-size: 1.1rem;
      line-height: 1.35;
    }

    .summary {
      margin: 0 0 12px;
      color: var(--vscode-descriptionForeground);
    }

    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 16px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .meta li {
      display: inline-flex;
      gap: 8px;
    }

    .meta-label {
      color: var(--vscode-descriptionForeground);
    }

    .link-row {
      margin-top: 12px;
      font-size: 0.92rem;
    }

    main {
      padding: 20px;
    }

    article > :first-child {
      margin-top: 0;
    }

    article > :last-child {
      margin-bottom: 0;
    }

    .fallback {
      padding: 12px 14px;
      border-left: 3px solid var(--vscode-editorInfo-foreground);
      background: color-mix(in srgb, var(--vscode-editorInfo-foreground) 12%, transparent);
    }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <p class="summary">${escapeHtml(summary)}</p>
    ${metadataHtml ? `<ul class="meta">${metadataHtml}</ul>` : ''}
    <div class="link-row">
      <a href="${escapeAttribute(docsHref)}">Open external SpotBugs docs</a>
    </div>
  </header>
  <main>
    <article>${body}</article>
  </main>
</body>
</html>`;
}

export function sanitizeFindingDetailHtml(
  raw: string,
  currentBugType?: string
): string {
  return sanitizeHtml(raw, getFindingDetailSanitizeOptions(currentBugType)).trim();
}

function renderDescriptionBody(finding: Finding): string {
  const detailHtml = finding.detailHtml?.trim();
  if (detailHtml) {
    const sanitized = sanitizeFindingDetailHtml(detailHtml, finding.type);
    if (sanitized) {
      return sanitized;
    }
  }

  const longDescription = finding.longDescription?.trim();
  if (longDescription) {
    return `<div class="fallback">${escapeHtml(longDescription).replace(/\n/g, '<br>')}</div>`;
  }

  return '<div class="fallback">No local SpotBugs description is available for this finding.</div>';
}

export function getFindingDescriptionTitle(finding: Finding): string {
  return finding.shortDescription?.trim() || formatFindingSummary(finding) || PANEL_TITLE;
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

function getFindingDetailSanitizeOptions(
  currentBugType?: string
): sanitizeHtml.IOptions {
  return {
    allowedTags: DETAIL_HTML_ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'title'],
    },
    allowedSchemes: DETAIL_HTML_ALLOWED_SCHEMES,
    allowedSchemesAppliedToAttributes: ['href'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    transformTags: {
      a: (_tagName, attribs) => {
        const sanitizedHref = getAllowedDetailHref(attribs.href, currentBugType);
        const sanitizedTitle = attribs.title?.trim();

        return {
          tagName: 'a',
          attribs: {
            ...(sanitizedHref ? { href: sanitizedHref } : {}),
            ...(sanitizedTitle ? { title: sanitizedTitle } : {}),
          },
        };
      },
    },
  };
}

function getAllowedDetailHref(
  raw?: string,
  currentBugType?: string
): string | undefined {
  return getAllowedAbsoluteUrl(raw, DETAIL_HTML_ALLOWED_PROTOCOLS, currentBugType);
}

function getExternalDocsHref(
  raw?: string,
  currentBugType?: string
): string | undefined {
  return getAllowedAbsoluteUrl(raw, new Set(['http:', 'https:']), currentBugType);
}

function getAllowedAbsoluteUrl(
  raw: string | undefined,
  allowedProtocols: ReadonlySet<string>,
  currentBugType?: string
): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const url = new URL(trimmed);
    if (allowedProtocols.has(url.protocol)) {
      rewriteLegacySpotBugsHelpUrl(url, currentBugType);
      return url.toString();
    }
  } catch {
    // Ignore invalid URLs and fall back to generic docs.
  }

  return undefined;
}
