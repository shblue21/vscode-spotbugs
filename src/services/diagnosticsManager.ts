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
import * as path from 'path';
import { BugInfo } from '../models/bugInfo';
import { formatBugSummary } from '../core/bugFormatter';

type BugRange = {
  range: Range;
  bug: BugInfo;
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

  replaceAll(findings: BugInfo[]): void {
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

  updateForFile(targetUri: Uri, findings: BugInfo[]): void {
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

  getBugsAt(uri: Uri, position: Position): BugInfo[] {
    const entries = this.findingsByFile.get(uri.toString());
    if (!entries) return [];
    return entries
      .filter(({ range }) => range.contains(position))
      .map(({ bug }) => bug);
  }

  private appendBug(
    bucket: { uri: Uri; entries: BugRange[]; diagnostics: Diagnostic[] },
    bug: BugInfo
  ): void {
    const range = this.createRange(bug);
    if (!range) return;
    bucket.entries.push({ range, bug });
    bucket.diagnostics.push(this.createDiagnostic(range, bug));
  }

  private createDiagnostic(range: Range, bug: BugInfo): Diagnostic {
    const message = formatBugSummary(bug);
    const severity = mapRankToSeverity(bug.rank);
    const diagnostic = new Diagnostic(range, message, severity);
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

  private createRange(bug: BugInfo): Range | undefined {
    const startLine = normalizeLineNumber(bug.startLine);
    const endLine = normalizeLineNumber(bug.endLine ?? bug.startLine);
    if (startLine === undefined || endLine === undefined) {
      return undefined;
    }
    return new Range(startLine, 0, endLine, Number.MAX_SAFE_INTEGER);
  }

  private resolveFileUri(bug: BugInfo): Uri | undefined {
    const filePath = bug.fullPath || bug.realSourcePath || bug.sourceFile;
    if (!filePath) {
      return undefined;
    }
    if (path.isAbsolute(filePath)) {
      return Uri.file(filePath);
    }
    const workspaceFolder = workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return undefined;
    }
    return Uri.file(path.join(workspaceFolder.uri.fsPath, filePath));
  }

  private getDocumentationUri(bug: BugInfo): Uri | undefined {
    const docBase = 'https://spotbugs.readthedocs.io/en/latest/bugDescriptions.html';
    try {
      return Uri.parse(docBase);
    } catch {
      return undefined;
    }
  }
}

function mapRankToSeverity(rank: number | undefined): DiagnosticSeverity {
  if (typeof rank !== 'number') {
    return DiagnosticSeverity.Information;
  }
  if (rank <= 4) {
    return DiagnosticSeverity.Error;
  }
  if (rank <= 9) {
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

