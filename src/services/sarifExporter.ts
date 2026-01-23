import { Bug, Severity } from '../model/bug';
import { formatBugSummary, rankToSeverity } from '../formatters/bugFormatting';
import { getBestEffortArtifactUri } from '../workspace/sourceLocator';

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
  findings: Bug[],
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

  for (const bug of filtered) {
    const ruleId = deriveRuleId(bug);
    if (!seenRules.has(ruleId)) {
      seenRules.add(ruleId);
      const ruleBuilder = new SarifRuleBuilder({ id: ruleId });
      ruleBuilder.setShortDescriptionText(bug.message || ruleId);
      run.addRule(ruleBuilder);
    }

    const resultBuilder = new SarifResultBuilder();
    resultBuilder.setRuleId(ruleId);
    resultBuilder.setMessageText(formatBugSummary(bug));
    resultBuilder.setLevel(severityToSarifLevel(rankToSeverity(bug.rank)));

    const uri = computeArtifactUri(bug);
    if (uri) {
      resultBuilder.setLocationArtifactUri({ uri });
    }
    const startLine = normalizeLineNumber(bug.startLine);
    const endLine = normalizeLineNumber(bug.endLine);
    if (startLine !== undefined || endLine !== undefined) {
      resultBuilder.setLocationRegion({ startLine, endLine });
    }

    run.addResult(resultBuilder);
  }

  sarif.addRun(run);
  const built = sarif.buildSarifOutput?.() || sarif.build?.() || sarif.toJSON?.();
  return built as SarifLog;
}

function applyRankFilter(bugs: Bug[], minRank?: number): Bug[] {
  if (typeof minRank !== 'number') return bugs;
  return bugs.filter((b) => (typeof b.rank === 'number' ? b.rank <= minRank : true));
}

function deriveRuleId(bug: Bug): string {
  return (bug.type || bug.abbrev || 'SPOTBUGS_Rule').toString();
}

function severityToSarifLevel(severity: Severity): 'error' | 'warning' | 'note' {
  if (severity === 'error') return 'error';
  if (severity === 'warning') return 'warning';
  return 'note';
}

function computeArtifactUri(bug: Bug): string | undefined {
  return getBestEffortArtifactUri(bug);
}

function normalizeLineNumber(line?: number): number | undefined {
  if (typeof line === 'number' && line > 0) return line;
  return undefined;
}
