import { Diagnostic, Uri } from 'vscode';
import { Finding } from '../model/finding';
import {
  GENERIC_SPOTBUGS_DOCS_URI,
  rewriteLegacySpotBugsHelpUrl,
} from './spotbugsDocumentationLinks';

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
  return tryParseUri(finding.helpUri, finding.type);
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

function tryParseUri(raw?: string, bugType?: string): Uri | undefined {
  const value = raw?.trim();
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value);
    rewriteLegacySpotBugsHelpUrl(url, bugType);
    return Uri.parse(url.toString());
  } catch {
    try {
      return Uri.parse(value);
    } catch {
      return undefined;
    }
  }
}
