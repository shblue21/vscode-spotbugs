import * as path from 'path';
import { Uri } from 'vscode';
import { BugInfo } from '../models/bugInfo';
import { formatBugSummary } from '../core/bugFormatter';

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
  findings: BugInfo[],
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
    resultBuilder.setLevel(mapRankToLevel(bug.rank));

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

function applyRankFilter(bugs: BugInfo[], minRank?: number): BugInfo[] {
  if (typeof minRank !== 'number') return bugs;
  return bugs.filter((b) => (typeof b.rank === 'number' ? b.rank <= minRank : true));
}

function deriveRuleId(bug: BugInfo): string {
  return (bug.type || bug.abbrev || 'SPOTBUGS_Rule').toString();
}

function mapRankToLevel(rank: number | undefined): 'error' | 'warning' | 'note' {
  if (typeof rank !== 'number') return 'note';
  if (rank <= 4) return 'error';
  if (rank <= 9) return 'warning';
  return 'note';
}

function computeArtifactUri(bug: BugInfo): string | undefined {
  const filePath = bug.fullPath || bug.realSourcePath || bug.sourceFile;
  if (!filePath) return undefined;
  if (path.isAbsolute(filePath)) {
    try {
      return Uri.file(filePath).toString();
    } catch {
      return filePath;
    }
  }
  return filePath.replace(/\\/g, '/');
}

function normalizeLineNumber(line?: number): number | undefined {
  if (typeof line === 'number' && line > 0) return line;
  return undefined;
}
