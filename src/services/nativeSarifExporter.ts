import type { AnalysisReportRun } from '../model/analysisReport';
import type { Finding } from '../model/finding';

interface NativeSarifLog extends Record<string, unknown> {
  version: string;
  runs: NativeSarifRun[];
}

interface NativeSarifRun extends Record<string, unknown> {
  results: NativeSarifResult[];
}

interface NativeSarifResult extends Record<string, unknown> {
  ruleId?: unknown;
}

export function buildNativeSarifLog(
  reportRuns: AnalysisReportRun[],
  selectedFindings: Finding[],
  includeOriginallyEmptyRuns = false
): NativeSarifLog {
  const selected = new Set(selectedFindings);
  const nativeRuns: NativeSarifRun[] = [];
  let root: NativeSarifLog | undefined;
  let matchedFindings = 0;

  for (const reportRun of reportRuns) {
    if (reportRun.analysisStatus) {
      continue;
    }

    const selectedIndices = reportRun.findings
      .map((finding, index) => (selected.has(finding) ? index : -1))
      .filter((index) => index >= 0);
    const includeEmptyRun =
      includeOriginallyEmptyRuns && reportRun.findings.length === 0;
    if (selectedIndices.length === 0 && !includeEmptyRun) {
      continue;
    }
    if (includeEmptyRun && !reportRun.nativeSarif) {
      continue;
    }

    const parsed = parseNativeSarif(reportRun.nativeSarif);
    validateAlignment(reportRun, parsed.runs[0]);
    root ??= parsed;
    nativeRuns.push({
      ...parsed.runs[0],
      results: selectedIndices.map((index) => parsed.runs[0].results[index]),
    });
    matchedFindings += selectedIndices.length;
  }

  if (!root || matchedFindings !== selected.size) {
    throw new Error('Native SpotBugs SARIF does not match the selected findings.');
  }

  return { ...root, runs: nativeRuns };
}

function parseNativeSarif(value: string | undefined): NativeSarifLog {
  if (!value) {
    throw new Error('Native SpotBugs SARIF is not available for this analysis.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (cause) {
    throw new Error('Native SpotBugs SARIF is malformed.', { cause });
  }
  if (
    !isRecord(parsed) ||
    parsed.version !== '2.1.0' ||
    !Array.isArray(parsed.runs) ||
    parsed.runs.length !== 1 ||
    !isRecord(parsed.runs[0]) ||
    !Array.isArray(parsed.runs[0].results) ||
    !parsed.runs[0].results.every(isRecord)
  ) {
    throw new Error('Native SpotBugs SARIF has an unexpected structure.');
  }
  return parsed as NativeSarifLog;
}

function validateAlignment(
  reportRun: AnalysisReportRun,
  nativeRun: NativeSarifRun
): void {
  if (nativeRun.results.length !== reportRun.findings.length) {
    throw new Error('Native SpotBugs SARIF result count does not match the analysis.');
  }
  for (let index = 0; index < reportRun.findings.length; index++) {
    if (nativeRun.results[index].ruleId !== reportRun.findings[index].type) {
      throw new Error('Native SpotBugs SARIF result order does not match the analysis.');
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
