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
import { Finding } from '../model/finding';
import { Severity } from '../model/severity';
import { formatFindingSummary, rankToSeverity } from '../formatters/findingFormatting';
import { getBestEffortFileUri } from '../workspace/findingLocator';

type FindingRange = {
  range: Range;
  finding: Finding;
};

export class SpotBugsDiagnosticsManager {
  private readonly collection: DiagnosticCollection;
  private readonly findingsByFile = new Map<string, FindingRange[]>();

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

  replaceAll(findings: Finding[]): void {
    this.clearAll();
    const grouped = new Map<string, { uri: Uri; entries: FindingRange[]; diagnostics: Diagnostic[] }>();
    for (const finding of findings) {
      const fileUri = this.resolveFileUri(finding);
      if (!fileUri) continue;
      const key = fileUri.toString();
      const entry = grouped.get(key) ?? { uri: fileUri, entries: [], diagnostics: [] };
      this.appendFinding(entry, finding);
      grouped.set(key, entry);
    }

    for (const [key, { uri, diagnostics, entries }] of grouped) {
      this.collection.set(uri, diagnostics);
      this.findingsByFile.set(key, entries);
    }
  }

  updateForFile(targetUri: Uri, findings: Finding[]): void {
    const filePath = targetUri.fsPath;
    const filtered = findings.filter((finding) => {
      const uri = this.resolveFileUri(finding);
      return uri?.fsPath === filePath;
    });

    const entries: FindingRange[] = [];
    const diagnostics: Diagnostic[] = [];
    for (const finding of filtered) {
      const range = this.createRange(finding);
      if (!range) continue;
      diagnostics.push(this.createDiagnostic(range, finding));
      entries.push({ range, finding });
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

  getFindingsAt(uri: Uri, position: Position): Finding[] {
    const entries = this.findingsByFile.get(uri.toString());
    if (!entries) return [];
    return entries
      .filter(({ range }) => range.contains(position))
      .map(({ finding }) => finding);
  }

  private appendFinding(
    bucket: { uri: Uri; entries: FindingRange[]; diagnostics: Diagnostic[] },
    finding: Finding
  ): void {
    const range = this.createRange(finding);
    if (!range) return;
    bucket.entries.push({ range, finding });
    bucket.diagnostics.push(this.createDiagnostic(range, finding));
  }

  private createDiagnostic(range: Range, finding: Finding): Diagnostic {
    const message = formatFindingSummary(finding);
    const severity = rankToSeverity(finding.rank);
    const diagnostic = new Diagnostic(range, message, toDiagnosticSeverity(severity));
    diagnostic.source = 'SpotBugs';
    const docUri = this.getDocumentationUri(finding);
    if (docUri) {
      diagnostic.code = {
        value: finding.type || finding.abbrev || 'SpotBugs',
        target: docUri,
      };
    } else {
      diagnostic.code = finding.type || finding.abbrev || 'SpotBugs';
    }
    diagnostic.relatedInformation = undefined;
    return diagnostic;
  }

  private createRange(finding: Finding): Range | undefined {
    const startLine = normalizeLineNumber(finding.location.startLine);
    const endLine = normalizeLineNumber(finding.location.endLine ?? finding.location.startLine);
    if (startLine === undefined || endLine === undefined) {
      return undefined;
    }
    return new Range(startLine, 0, endLine, Number.MAX_SAFE_INTEGER);
  }

  private resolveFileUri(finding: Finding): Uri | undefined {
    return getBestEffortFileUri(finding);
  }

  private getDocumentationUri(_finding: Finding): Uri | undefined {
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
