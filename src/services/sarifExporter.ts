import { Finding } from '../model/finding';
import { Severity } from '../model/severity';
import { formatFindingSummary, rankToSeverity } from '../formatters/findingFormatting';
import { getSarifArtifactUri } from './sarifArtifactLocation';

export interface SarifExportOptions {
  runName?: string;
  toolVersion?: string;
  minRank?: number;
  workspaceRootPath?: string;
}

export interface SarifLog {
  $schema: string;
  version: '2.1.0';
  runs: SarifRun[];
}

interface SarifRun {
  tool: {
    driver: SarifToolComponent;
  };
  results: SarifResult[];
  taxonomies?: SarifToolComponent[];
  properties?: Record<string, string>;
}

interface SarifToolComponent {
  name: string;
  version?: string;
  rules?: SarifRule[];
  taxa?: SarifTaxon[];
  shortDescription?: SarifMessage;
}

interface SarifRule {
  id: string;
  shortDescription?: SarifMessage;
  fullDescription?: SarifMessage;
  helpUri?: string;
  relationships?: SarifRelationship[];
}

interface SarifRelationship {
  kinds: string[];
  target: {
    id: string;
    toolComponent: {
      name: string;
    };
  };
}

interface SarifTaxon {
  id: string;
  shortDescription?: SarifMessage;
}

interface SarifResult {
  ruleId: string;
  level: 'error' | 'warning' | 'note';
  message: SarifMessage;
  locations?: SarifLocation[];
  partialFingerprints?: Record<string, string>;
}

interface SarifLocation {
  physicalLocation: {
    artifactLocation: {
      uri: string;
    };
    region?: {
      startLine: number;
      endLine?: number;
    };
  };
}

interface SarifMessage {
  text: string;
}

const SARIF_SCHEMA =
  'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json';
const CWE_COMPONENT_NAME = 'CWE';

export function buildSarifLog(
  findings: Finding[],
  options: SarifExportOptions = {}
): SarifLog {
  const filtered = applyRankFilter(findings, options.minRank);
  const rulesById = new Map<string, SarifRule>();
  const cweIds = new Set<number>();
  const results = filtered.map((finding) => {
    const ruleId = deriveRuleId(finding);
    const rule = rulesById.get(ruleId) ?? createRule(ruleId, finding);
    rulesById.set(ruleId, mergeRule(rule, finding));
    if (typeof finding.cweId === 'number' && finding.cweId > 0) {
      cweIds.add(finding.cweId);
    }
    return createResult(finding, ruleId, options.workspaceRootPath);
  });

  const run: SarifRun = {
    tool: {
      driver: {
        name: 'SpotBugs',
      },
    },
    results: sortResults(results),
  };
  if (options.toolVersion) {
    run.tool.driver.version = options.toolVersion;
  }
  if (options.runName) {
    run.properties = { spotbugsRunName: options.runName };
  }

  const rules = Array.from(rulesById.values()).sort((left, right) => left.id.localeCompare(right.id));
  if (rules.length > 0) {
    run.tool.driver.rules = rules;
  }

  const taxonomies = createTaxonomies(Array.from(cweIds.values()));
  if (taxonomies.length > 0) {
    run.taxonomies = taxonomies;
  }

  return {
    $schema: SARIF_SCHEMA,
    version: '2.1.0',
    runs: [run],
  };
}

function applyRankFilter(findings: Finding[], minRank?: number): Finding[] {
  if (typeof minRank !== 'number') {
    return findings;
  }
  return findings.filter((finding) =>
    typeof finding.rank === 'number' ? finding.rank <= minRank : true
  );
}

function deriveRuleId(finding: Finding): string {
  return (finding.type || finding.abbrev || 'SPOTBUGS_Rule').toString();
}

function mergeRule(rule: SarifRule, finding: Finding): SarifRule {
  const next = createRule(rule.id, finding);
  return {
    id: rule.id,
    shortDescription: rule.shortDescription ?? next.shortDescription,
    fullDescription: rule.fullDescription ?? next.fullDescription,
    helpUri: rule.helpUri ?? next.helpUri,
    relationships: rule.relationships ?? next.relationships,
  };
}

function createRule(ruleId: string, finding: Finding): SarifRule {
  return compactObject<SarifRule>({
    id: ruleId,
    shortDescription: {
      text: toRuleShortDescriptionText(finding, ruleId),
    },
    fullDescription: finding.longDescription ? { text: finding.longDescription } : undefined,
    helpUri: finding.helpUri,
    relationships: createRuleRelationships(finding.cweId),
  });
}

function createResult(
  finding: Finding,
  ruleId: string,
  workspaceRootPath?: string
): SarifResult {
  const location = createLocation(finding, workspaceRootPath);
  const partialFingerprints =
    typeof finding.instanceHash === 'string' && finding.instanceHash.length > 0
      ? { instanceHash: finding.instanceHash }
      : undefined;
  return compactObject<SarifResult>({
    ruleId,
    level: findingToSarifLevel(finding),
    message: { text: toResultMessageText(finding) },
    locations: location ? [location] : undefined,
    partialFingerprints,
  });
}

function createLocation(
  finding: Finding,
  workspaceRootPath?: string
): SarifLocation | undefined {
  const uri = getSarifArtifactUri(finding, { workspaceRootPath });
  const startLine = normalizeLineNumber(finding.location.startLine);
  if (!uri) {
    return undefined;
  }

  const endLine = normalizeLineNumber(finding.location.endLine);
  return compactObject<SarifLocation>({
    physicalLocation: compactObject<SarifLocation['physicalLocation']>({
      artifactLocation: {
        uri,
      },
      region:
        startLine !== undefined
          ? compactObject({
              startLine,
              endLine:
                endLine !== undefined && endLine > startLine ? endLine : undefined,
            })
          : undefined,
    }),
  });
}

function createRuleRelationships(cweId?: number): SarifRelationship[] | undefined {
  if (typeof cweId !== 'number' || cweId <= 0) {
    return undefined;
  }
  return [
    {
      kinds: ['relevant'],
      target: {
        id: String(cweId),
        toolComponent: {
          name: CWE_COMPONENT_NAME,
        },
      },
    },
  ];
}

function createTaxonomies(cweIds: number[]): SarifToolComponent[] {
  const taxa = cweIds
    .filter((cweId) => cweId > 0)
    .sort((left, right) => left - right)
    .map((cweId) => ({
      id: String(cweId),
      shortDescription: {
        text: `CWE-${cweId}`,
      },
    }));
  if (taxa.length === 0) {
    return [];
  }
  return [
    {
      name: CWE_COMPONENT_NAME,
      shortDescription: {
        text: 'MITRE Common Weakness Enumeration',
      },
      taxa,
    },
  ];
}

function sortResults(results: SarifResult[]): SarifResult[] {
  return results.slice().sort((left, right) => {
    const leftLocation = getResultLocationKey(left);
    const rightLocation = getResultLocationKey(right);
    return (
      left.ruleId.localeCompare(right.ruleId) ||
      leftLocation.localeCompare(rightLocation) ||
      left.message.text.localeCompare(right.message.text)
    );
  });
}

function getResultLocationKey(result: SarifResult): string {
  const location = result.locations?.[0];
  const uri = location?.physicalLocation.artifactLocation.uri ?? '';
  const startLine = location?.physicalLocation.region?.startLine ?? 0;
  const endLine = location?.physicalLocation.region?.endLine ?? 0;
  return `${uri}:${startLine}:${endLine}`;
}

function severityToSarifLevel(severity: Severity): 'error' | 'warning' | 'note' {
  if (severity === 'error') {
    return 'error';
  }
  if (severity === 'warning') {
    return 'warning';
  }
  return 'note';
}

function findingToSarifLevel(finding: Finding): 'error' | 'warning' | 'note' {
  const priority = finding.priority?.trim().toLowerCase();
  if (priority === 'high') {
    return 'error';
  }
  if (priority === 'low') {
    return 'note';
  }
  if (priority === 'medium' && typeof finding.rank !== 'number') {
    return 'warning';
  }
  return severityToSarifLevel(rankToSeverity(finding.rank));
}

function toRuleShortDescriptionText(finding: Finding, ruleId: string): string {
  const baseText = finding.shortDescription || toResultMessageText(finding) || ruleId;
  return /[.!?]$/.test(baseText) ? baseText : `${baseText}.`;
}

function toResultMessageText(finding: Finding): string {
  const shortDescription = finding.shortDescription?.trim();
  if (shortDescription) {
    return shortDescription.replace(/[.!?]+$/, '');
  }
  return formatFindingSummary(finding).replace(/^\[[^\]]+\]\s*/, '');
}

function normalizeLineNumber(line?: number): number | undefined {
  if (typeof line === 'number' && line > 0) {
    return line;
  }
  return undefined;
}

function compactObject<T extends object>(value: T): T {
  const entries = Object.entries(value).filter(([, entryValue]) => entryValue !== undefined);
  return Object.fromEntries(entries) as T;
}
