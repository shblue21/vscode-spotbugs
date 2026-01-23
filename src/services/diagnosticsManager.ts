import {
  Diagnostic,
  DiagnosticCollection,
  DiagnosticSeverity,
  languages,
  Position,
  Range,
  Uri,
  workspace,
} from 'vscode';
import { Bug, Severity } from '../model/bug';
import { formatBugSummary, rankToSeverity } from '../formatters/bugFormatting';
import { getBestEffortFileUri } from '../workspace/sourceLocator';

type BugRange = {
  range: Range;
  bug: Bug;
};

export class SpotBugsDiagnosticsManager {
  private readonly collection: DiagnosticCollection;
  private readonly findingsByFile = new Map<string, BugRange[]>();

  constructor() {
    this.collection = languages.createDiagnosticCollection('spotbugs');
  }

  dispose(): void {
    this.collection.dispose();
    this.findingsByFile.clear();
  }

  clearAll(): void {
    this.collection.clear();
    this.findingsByFile.clear();
  }

  replaceAll(findings: Bug[]): void {
    this.clearAll();
    const grouped = new Map<string, { uri: Uri; entries: BugRange[]; diagnostics: Diagnostic[] }>();
    for (const bug of findings) {
      const fileUri = this.resolveFileUri(bug);
      if (!fileUri) continue;
      const key = fileUri.toString();
      const entry = grouped.get(key) ?? { uri: fileUri, entries: [], diagnostics: [] };
      this.appendBug(entry, bug);
      grouped.set(key, entry);
    }

    for (const [key, { uri, diagnostics, entries }] of grouped) {
      this.collection.set(uri, diagnostics);
      this.findingsByFile.set(key, entries);
    }
  }

  updateForFile(targetUri: Uri, findings: Bug[]): void {
    const filePath = targetUri.fsPath;
    const filtered = findings.filter((bug) => {
      const uri = this.resolveFileUri(bug);
      return uri?.fsPath === filePath;
    });

    const entries: BugRange[] = [];
    const diagnostics: Diagnostic[] = [];
    for (const bug of filtered) {
      const range = this.createRange(bug);
      if (!range) continue;
      diagnostics.push(this.createDiagnostic(range, bug));
      entries.push({ range, bug });
    }

    const key = targetUri.toString();
    if (diagnostics.length === 0) {
      this.collection.delete(targetUri);
      this.findingsByFile.delete(key);
      return;
    }

    this.collection.set(targetUri, diagnostics);
    this.findingsByFile.set(key, entries);
  }

  getBugsAt(uri: Uri, position: Position): Bug[] {
    const entries = this.findingsByFile.get(uri.toString());
    if (!entries) return [];
    return entries
      .filter(({ range }) => range.contains(position))
      .map(({ bug }) => bug);
  }

  private appendBug(
    bucket: { uri: Uri; entries: BugRange[]; diagnostics: Diagnostic[] },
    bug: Bug
  ): void {
    const range = this.createRange(bug);
    if (!range) return;
    bucket.entries.push({ range, bug });
    bucket.diagnostics.push(this.createDiagnostic(range, bug));
  }

  private createDiagnostic(range: Range, bug: Bug): Diagnostic {
    const message = formatBugSummary(bug);
    const severity = rankToSeverity(bug.rank);
    const diagnostic = new Diagnostic(range, message, toDiagnosticSeverity(severity));
    diagnostic.source = 'SpotBugs';
    const docUri = this.getDocumentationUri(bug);
    if (docUri) {
      diagnostic.code = {
        value: bug.type || bug.abbrev || 'SpotBugs',
        target: docUri,
      };
    } else {
      diagnostic.code = bug.type || bug.abbrev || 'SpotBugs';
    }
    diagnostic.relatedInformation = undefined;
    return diagnostic;
  }

  private createRange(bug: Bug): Range | undefined {
    const startLine = normalizeLineNumber(bug.startLine);
    const endLine = normalizeLineNumber(bug.endLine ?? bug.startLine);
    if (startLine === undefined || endLine === undefined) {
      return undefined;
    }
    return new Range(startLine, 0, endLine, Number.MAX_SAFE_INTEGER);
  }

  private resolveFileUri(bug: Bug): Uri | undefined {
    return getBestEffortFileUri(bug);
  }

  private getDocumentationUri(bug: Bug): Uri | undefined {
    const docBase = 'https://spotbugs.readthedocs.io/en/latest/bugDescriptions.html';
    try {
      return Uri.parse(docBase);
    } catch {
      return undefined;
    }
  }
}

function toDiagnosticSeverity(severity: Severity): DiagnosticSeverity {
  if (severity === 'error') {
    return DiagnosticSeverity.Error;
  }
  if (severity === 'warning') {
    return DiagnosticSeverity.Warning;
  }
  return DiagnosticSeverity.Information;
}

function normalizeLineNumber(line?: number): number | undefined {
  if (typeof line !== 'number' || Number.isNaN(line) || line <= 0) {
    return undefined;
  }
  return Math.max(line - 1, 0);
}
