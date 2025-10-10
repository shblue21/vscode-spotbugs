import {
  Disposable,
  Hover,
  MarkdownString,
  Position,
  TextDocument,
  languages,
} from 'vscode';
import { SpotBugsDiagnosticsManager } from './diagnosticsManager';
import { formatBugSummary } from '../core/bugFormatter';
import { BugInfo } from '../models/bugInfo';

const SUPPORTED_LANGUAGES = ['java'];

export function registerSpotBugsHoverProvider(
  diagnosticsManager: SpotBugsDiagnosticsManager
): Disposable {
  const selector = SUPPORTED_LANGUAGES.map((language) => ({ scheme: 'file', language }));
  return languages.registerHoverProvider(selector, {
    provideHover(document: TextDocument, position: Position): Hover | undefined {
      const bugs = diagnosticsManager.getBugsAt(document.uri, position);
      if (bugs.length === 0) {
        return undefined;
      }

      const markdown = new MarkdownString(undefined, true);
      markdown.isTrusted = true;

      bugs.forEach((bug, index) => {
        if (index > 0) {
          markdown.appendMarkdown('\n---\n');
        }
        appendBugDetails(markdown, bug);
      });

      return new Hover(markdown);
    },
  });
}

function appendBugDetails(md: MarkdownString, bug: BugInfo): void {
  md.appendMarkdown(`- Category: ${bug.category || 'Unknown'}\n`);
  if (bug.rank !== undefined) {
    md.appendMarkdown(`- Rank: ${bug.rank}\n`);
  }
  if (bug.priority !== undefined) {
    md.appendMarkdown(`- Priority: ${bug.priority}\n`);
  }
  if (bug.type) {
    md.appendMarkdown(`- Type: ${bug.type}\n`);
  }
  const docUrl = getDocumentationUrl();
  md.appendMarkdown(`\n[Open SpotBugs docs](${docUrl})`);
}

function getDocumentationUrl(): string {
  return 'https://spotbugs.readthedocs.io/en/latest/bugDescriptions.html';
}
