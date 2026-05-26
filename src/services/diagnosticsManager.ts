import * as path from 'path';
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
import type { DiagnosticUpdateScope } from '../model/diagnosticScope';
import { Finding } from '../model/finding';
import { Severity } from '../model/severity';
import { formatFindingSummary, rankToSeverity } from '../formatters/findingFormatting';
import { getBestEffortFileUri } from '../workspace/findingLocator';
import {
  getFindingDiagnosticCodeValue,
  getFindingDocumentationUri,
  hasFindingLocalDescription,
  SPOTBUGS_DIAGNOSTIC_SOURCE,
} from './spotbugsDiagnosticSupport';

type FindingRange = {
  range: Range;
  finding: Finding;
};

type FindingBucket = {
  uri: Uri;
  entries: FindingRange[];
  diagnostics: Diagnostic[];
};

export class SpotBugsDiagnosticsManager {
  private readonly collection: DiagnosticCollection;
  private readonly findingsByFile = new Map<string, FindingRange[]>();
  private readonly filesByReturnedScope = new Map<string, Set<string>>();

  constructor() {
    this.collection = languages.createDiagnosticCollection('spotbugs');
  }

  dispose(): void {
    this.collection.dispose();
    this.findingsByFile.clear();
    this.filesByReturnedScope.clear();
  }

  clearAll(): void {
    this.collection.clear();
    this.findingsByFile.clear();
    this.filesByReturnedScope.clear();
  }

  replaceAll(findings: Finding[]): void {
    this.clearAll();
    this.publishGrouped(this.groupFindings(findings));
  }

  replaceForScope(scope: DiagnosticUpdateScope, findings: Finding[]): void {
    if (scope.kind === 'file') {
      this.updateForFile(scope.uri, findings);
      return;
    }

    if (scope.kind === 'folder') {
      this.clearFolderScope(scope.uri);
      this.publishGrouped(
        this.groupFindings(findings, (fileUri) => isUriInsideOrEqual(scope.uri, fileUri))
      );
      return;
    }

    this.clearReturnedScopesInside(scope.uri);
    const scopeKey = getScopeKey(scope);
    const publishedFiles = new Set<string>();
    this.publishGrouped(this.groupFindings(findings), publishedFiles);
    this.claimReturnedOwnership(scopeKey, publishedFiles);
  }

  updateForFile(targetUri: Uri, findings: Finding[]): void {
    this.revokeReturnedOwnership(targetUri.toString());
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
    bucket: FindingBucket,
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
    diagnostic.source = SPOTBUGS_DIAGNOSTIC_SOURCE;
    const docUri = !hasFindingLocalDescription(finding)
      ? getFindingDocumentationUri(finding)
      : undefined;
    if (docUri !== undefined) {
      diagnostic.code = {
        value: getFindingDiagnosticCodeValue(finding),
        target: docUri,
      };
    } else {
      diagnostic.code = getFindingDiagnosticCodeValue(finding);
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

  private clearFolderScope(folderUri: Uri): void {
    const keysToDelete = Array.from(this.findingsByFile.keys()).filter((key) =>
      isUriInsideOrEqual(folderUri, Uri.parse(key))
    );
    for (const key of keysToDelete) {
      this.deletePublishedFile(key);
    }
  }

  private clearReturnedScope(scopeKey: string): void {
    const files = this.filesByReturnedScope.get(scopeKey);
    if (!files) {
      return;
    }
    for (const key of Array.from(files)) {
      this.deletePublishedFile(key);
    }
    this.filesByReturnedScope.delete(scopeKey);
  }

  private clearReturnedScopesInside(scopeUri: Uri): void {
    const scopeKeysToDelete = Array.from(this.filesByReturnedScope.keys()).filter(
      (scopeKey) => {
        const candidateUri = getReturnedScopeUri(scopeKey);
        return candidateUri ? isUriInsideOrEqual(scopeUri, candidateUri) : false;
      }
    );
    for (const scopeKey of scopeKeysToDelete) {
      this.clearReturnedScope(scopeKey);
    }
  }

  private deletePublishedFile(key: string): void {
    this.collection.delete(Uri.parse(key));
    this.findingsByFile.delete(key);
    this.revokeReturnedOwnership(key);
  }

  private revokeReturnedOwnership(key: string): void {
    for (const [scopeKey, files] of Array.from(this.filesByReturnedScope)) {
      files.delete(key);
      if (files.size === 0) {
        this.filesByReturnedScope.delete(scopeKey);
      }
    }
  }

  private claimReturnedOwnership(scopeKey: string, files: Set<string>): void {
    if (files.size === 0) {
      this.filesByReturnedScope.delete(scopeKey);
      return;
    }
    for (const key of files) {
      this.revokeReturnedOwnership(key);
    }
    this.filesByReturnedScope.set(scopeKey, files);
  }

  private groupFindings(
    findings: Finding[],
    includeFile: (uri: Uri) => boolean = () => true
  ): Map<string, FindingBucket> {
    const grouped = new Map<string, FindingBucket>();

    for (const finding of findings) {
      const fileUri = this.resolveFileUri(finding);
      if (!fileUri || !includeFile(fileUri)) {
        continue;
      }
      const key = fileUri.toString();
      const entry = grouped.get(key) ?? {
        uri: fileUri,
        entries: [],
        diagnostics: [],
      };
      this.appendFinding(entry, finding);
      grouped.set(key, entry);
    }

    return grouped;
  }

  private publishGrouped(
    grouped: Map<string, FindingBucket>,
    publishedFiles?: Set<string>
  ): void {
    for (const [key, { uri, diagnostics, entries }] of grouped) {
      this.collection.set(uri, diagnostics);
      this.findingsByFile.set(key, entries);
      publishedFiles?.add(key);
    }
  }
}

function getScopeKey(
  scope: Extract<DiagnosticUpdateScope, { kind: 'returned-files' }>
): string {
  return `${RETURNED_SCOPE_KEY_PREFIX}${scope.uri.toString()}`;
}

const RETURNED_SCOPE_KEY_PREFIX = 'returned-files:';

function getReturnedScopeUri(scopeKey: string): Uri | undefined {
  if (!scopeKey.startsWith(RETURNED_SCOPE_KEY_PREFIX)) {
    return undefined;
  }
  return Uri.parse(scopeKey.slice(RETURNED_SCOPE_KEY_PREFIX.length));
}

function isUriInsideOrEqual(folderUri: Uri, candidateUri: Uri): boolean {
  if (folderUri.scheme !== 'file' || candidateUri.scheme !== 'file') {
    const folder = folderUri.toString();
    const candidate = candidateUri.toString();
    return candidate === folder || candidate.startsWith(`${folder}/`);
  }

  return isPathInsideOrEqual(folderUri.fsPath, candidateUri.fsPath);
}

function isPathInsideOrEqual(parentPath: string, candidatePath: string): boolean {
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return (
    relative === '' ||
    (relative.length > 0 &&
      relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
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
