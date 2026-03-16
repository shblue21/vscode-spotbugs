import { Diagnostic, Uri } from 'vscode';
import { Finding } from '../model/finding';

const GENERIC_SPOTBUGS_DOCS_URI =
  'https://spotbugs.readthedocs.io/en/latest/bugDescriptions.html';

export const SPOTBUGS_DIAGNOSTIC_SOURCE = 'SpotBugs';

export function getDiagnosticCodeValue(
  code: Diagnostic['code']
): string | number | undefined {
  if (typeof code === 'string' || typeof code === 'number') {
    return code;
  }
  return code?.value;
}

export function getFindingDiagnosticCodeValue(finding: Finding): string {
  return finding.type || finding.abbrev || SPOTBUGS_DIAGNOSTIC_SOURCE;
}

export function hasFindingLocalDescription(finding: Finding): boolean {
  return typeof finding.detailHtml === 'string' && finding.detailHtml.trim().length > 0;
}

export function getFindingRuleDocumentationUri(
  finding: Finding
): Uri | undefined {
  return tryParseUri(finding.helpUri);
}

export function getFindingDocumentationUri(
  finding: Finding
): Uri | undefined {
  return (
    getFindingRuleDocumentationUri(finding) ??
    tryParseUri(GENERIC_SPOTBUGS_DOCS_URI)
  );
}

export function isSpotBugsDiagnostic(diagnostic: Diagnostic): boolean {
  return diagnostic.source === SPOTBUGS_DIAGNOSTIC_SOURCE;
}

function tryParseUri(raw?: string): Uri | undefined {
  const value = raw?.trim();
  if (!value) {
    return undefined;
  }
  try {
    return Uri.parse(value);
  } catch {
    return undefined;
  }
}
