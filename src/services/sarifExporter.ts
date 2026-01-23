import { Finding } from '../model/finding';
import { Severity } from '../model/severity';
import { formatFindingSummary, rankToSeverity } from '../formatters/findingFormatting';
import { getBestEffortArtifactUri } from '../workspace/findingLocator';

export interface SarifExportOptions {
  runName?: string;
  toolVersion?: string;
  minRank?: number;
}

export interface SarifLog {
  version: '2.1.0';
  runs: any[];
}

export function buildSarifLog(
  findings: Finding[],
  options: SarifExportOptions = {}
): SarifLog {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const lib: any = require('node-sarif-builder');
  const { SarifBuilder, SarifRunBuilder, SarifRuleBuilder, SarifResultBuilder } = lib;
  const sarif = new SarifBuilder();

  const run = new SarifRunBuilder();
  run.setToolDriverName('SpotBugs');
  if (options.toolVersion) run.setToolDriverVersion(options.toolVersion);

  const filtered = applyRankFilter(findings, options.minRank);
  const seenRules = new Set<string>();

  for (const finding of filtered) {
    const ruleId = deriveRuleId(finding);
    if (!seenRules.has(ruleId)) {
      seenRules.add(ruleId);
      const ruleBuilder = new SarifRuleBuilder({ id: ruleId });
      ruleBuilder.setShortDescriptionText(finding.message || ruleId);
      run.addRule(ruleBuilder);
    }

    const resultBuilder = new SarifResultBuilder();
    resultBuilder.setRuleId(ruleId);
    resultBuilder.setMessageText(formatFindingSummary(finding));
    resultBuilder.setLevel(severityToSarifLevel(rankToSeverity(finding.rank)));

    const uri = computeArtifactUri(finding);
    if (uri) {
      resultBuilder.setLocationArtifactUri({ uri });
    }
    const startLine = normalizeLineNumber(finding.location.startLine);
    const endLine = normalizeLineNumber(finding.location.endLine);
    if (startLine !== undefined || endLine !== undefined) {
      resultBuilder.setLocationRegion({ startLine, endLine });
    }

    run.addResult(resultBuilder);
  }

  sarif.addRun(run);
  const built = sarif.buildSarifOutput?.() || sarif.build?.() || sarif.toJSON?.();
  return built as SarifLog;
}

function applyRankFilter(findings: Finding[], minRank?: number): Finding[] {
  if (typeof minRank !== 'number') return findings;
  return findings.filter((finding) =>
    typeof finding.rank === 'number' ? finding.rank <= minRank : true
  );
}

function deriveRuleId(finding: Finding): string {
  return (finding.type || finding.abbrev || 'SPOTBUGS_Rule').toString();
}

function severityToSarifLevel(severity: Severity): 'error' | 'warning' | 'note' {
  if (severity === 'error') return 'error';
  if (severity === 'warning') return 'warning';
  return 'note';
}

function computeArtifactUri(finding: Finding): string | undefined {
  return getBestEffortArtifactUri(finding);
}

function normalizeLineNumber(line?: number): number | undefined {
  if (typeof line === 'number' && line > 0) return line;
  return undefined;
}
