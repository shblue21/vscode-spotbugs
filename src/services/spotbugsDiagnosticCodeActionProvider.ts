import {
  CancellationToken,
  CodeAction,
  CodeActionContext,
  CodeActionKind,
  CodeActionProvider,
  Diagnostic,
  Range,
  TextDocument,
} from 'vscode';
import { formatFindingSummary } from '../formatters/findingFormatting';
import { Finding } from '../model/finding';
import { SpotBugsDiagnosticsManager } from './diagnosticsManager';
import {
  getDiagnosticCodeValue,
  getFindingDiagnosticCodeValue,
  getFindingRuleDocumentationUri,
  isSpotBugsDiagnostic,
} from './spotbugsDiagnosticSupport';

const OPEN_RULE_DOCS_TITLE = 'Open SpotBugs rule docs';

export class SpotBugsDiagnosticCodeActionProvider
  implements CodeActionProvider
{
  static readonly providedCodeActionKinds = [CodeActionKind.QuickFix];

  constructor(private readonly diagnostics: SpotBugsDiagnosticsManager) {}

  provideCodeActions(
    document: TextDocument,
    _range: Range,
    context: CodeActionContext,
    _token: CancellationToken
  ): CodeAction[] {
    if (context.only && !context.only.contains(CodeActionKind.QuickFix)) {
      return [];
    }

    const actions: CodeAction[] = [];
    const seenTargets = new Set<string>();

    for (const diagnostic of context.diagnostics) {
      if (!isSpotBugsDiagnostic(diagnostic)) {
        continue;
      }

      const finding = this.findMatchingFinding(document, diagnostic);
      const target = finding && getFindingRuleDocumentationUri(finding);
      if (!target) {
        continue;
      }

      const key = `${diagnostic.range.start.line}:${target.toString()}`;
      if (seenTargets.has(key)) {
        continue;
      }

      const action = new CodeAction(
        OPEN_RULE_DOCS_TITLE,
        CodeActionKind.QuickFix
      );
      action.command = {
        command: 'vscode.open',
        title: OPEN_RULE_DOCS_TITLE,
        arguments: [target],
      };
      action.diagnostics = [diagnostic];
      actions.push(action);
      seenTargets.add(key);
    }

    return actions;
  }

  private findMatchingFinding(
    document: TextDocument,
    diagnostic: Diagnostic
  ): Finding | undefined {
    const findings = this.diagnostics.getFindingsAt(
      document.uri,
      diagnostic.range.start
    );
    if (findings.length === 0) {
      return undefined;
    }

    const diagnosticCode = getDiagnosticCodeValue(diagnostic.code);
    const exactMatch = findings.find((finding) =>
      this.matchesDiagnostic(finding, diagnostic, diagnosticCode)
    );
    if (exactMatch) {
      return exactMatch;
    }

    const codeMatch = findings.find(
      (finding) =>
        getFindingRuleDocumentationUri(finding) &&
        diagnosticCode !== undefined &&
        getFindingDiagnosticCodeValue(finding) === diagnosticCode
    );
    if (codeMatch) {
      return codeMatch;
    }

    return findings.find((finding) => getFindingRuleDocumentationUri(finding));
  }

  private matchesDiagnostic(
    finding: Finding,
    diagnostic: Diagnostic,
    diagnosticCode: string | number | undefined
  ): boolean {
    if (!getFindingRuleDocumentationUri(finding)) {
      return false;
    }

    if (
      diagnosticCode !== undefined &&
      getFindingDiagnosticCodeValue(finding) !== diagnosticCode
    ) {
      return false;
    }

    return formatFindingSummary(finding) === diagnostic.message;
  }
}
