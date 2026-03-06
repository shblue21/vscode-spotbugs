export interface NormalizedSarifLog {
  toolDriver: {
    name: string;
    version?: string;
  };
  rules: NormalizedSarifRule[];
  results: NormalizedSarifResult[];
}

export interface NormalizedSarifRule {
  id: string;
  shortDescription?: string;
  fullDescription?: string;
  helpUri?: string;
  relationships?: NormalizedSarifRelationship[];
}

export interface NormalizedSarifRelationship {
  kinds: string[];
  targetId: string;
  targetComponent?: string;
}

export interface NormalizedSarifResult {
  ruleId: string;
  level?: string;
  message?: string;
  uri?: string;
  startLine?: number;
  endLine?: number;
  instanceHash?: string;
}

export interface NormalizeSarifOptions {
  workspaceRootPath?: string;
  includeFullDescription?: boolean;
  includeFingerprints?: boolean;
  includeRelationships?: boolean;
}

export function normalizeSarifLog(
  log: unknown,
  options: NormalizeSarifOptions = {}
): NormalizedSarifLog {
  const run = getFirstRun(log);
  const driver = get(run, 'tool', 'driver') as
    | { name?: unknown; version?: unknown; rules?: unknown[] }
    | undefined;
  const rules: unknown[] = Array.isArray(driver?.rules) ? driver.rules : [];
  const results = Array.isArray((run as { results?: unknown[] } | undefined)?.results)
    ? ((run as { results?: unknown[] }).results ?? [])
    : [];

  return {
    toolDriver: {
      name: readString(driver?.name) ?? '',
      version: readString(driver?.version) ?? undefined,
    },
    rules: rules.map((rule: unknown) => normalizeRule(rule, options)).sort(compareRules),
    results: results
      .map((result) => normalizeResult(result, options))
      .sort(compareResults),
  };
}

function getFirstRun(log: unknown): Record<string, unknown> | undefined {
  if (!log || typeof log !== 'object') {
    return undefined;
  }
  const runs = (log as { runs?: unknown[] }).runs;
  if (!Array.isArray(runs) || runs.length === 0) {
    return undefined;
  }
  const firstRun = runs[0];
  return firstRun && typeof firstRun === 'object'
    ? (firstRun as Record<string, unknown>)
    : undefined;
}

function normalizeRule(
  rule: unknown,
  options: NormalizeSarifOptions
): NormalizedSarifRule {
  const relationships = options.includeRelationships
    ? normalizeRelationships((rule as { relationships?: unknown[] } | undefined)?.relationships)
    : undefined;
  return compactObject<NormalizedSarifRule>({
    id: readString((rule as { id?: unknown } | undefined)?.id) ?? '',
    shortDescription: readString(get(rule, 'shortDescription', 'text')) ?? undefined,
    fullDescription: options.includeFullDescription
      ? readString(get(rule, 'fullDescription', 'text')) ?? undefined
      : undefined,
    helpUri: readString((rule as { helpUri?: unknown } | undefined)?.helpUri) ?? undefined,
    relationships: relationships && relationships.length > 0 ? relationships : undefined,
  });
}

function normalizeRelationships(relationships: unknown): NormalizedSarifRelationship[] {
  if (!Array.isArray(relationships)) {
    return [];
  }
  return relationships
    .map((relationship) =>
      compactObject<NormalizedSarifRelationship>({
        kinds: Array.isArray((relationship as { kinds?: unknown[] } | undefined)?.kinds)
          ? ((relationship as { kinds?: string[] }).kinds ?? []).slice().sort()
          : [],
        targetId:
          readString(get(relationship, 'target', 'id')) ?? '',
        targetComponent:
          readString(get(relationship, 'target', 'toolComponent', 'name')) ?? undefined,
      })
    )
    .sort((left, right) => left.targetId.localeCompare(right.targetId));
}

function normalizeResult(
  result: unknown,
  options: NormalizeSarifOptions
): NormalizedSarifResult {
  const location = getFirstLocation(result);
  return compactObject<NormalizedSarifResult>({
    ruleId: readString((result as { ruleId?: unknown } | undefined)?.ruleId) ?? '',
    level: readString((result as { level?: unknown } | undefined)?.level) ?? undefined,
    message: readString(get(result, 'message', 'text')) ?? undefined,
    uri: normalizeUri(
      readString(get(location, 'physicalLocation', 'artifactLocation', 'uri')) ?? undefined,
      options.workspaceRootPath
    ),
    startLine:
      readNumber(get(location, 'physicalLocation', 'region', 'startLine')) ?? undefined,
    endLine:
      readNumber(get(location, 'physicalLocation', 'region', 'endLine')) ?? undefined,
    instanceHash: options.includeFingerprints
      ? readString(get(result, 'partialFingerprints', 'instanceHash')) ?? undefined
      : undefined,
  });
}

function getFirstLocation(result: unknown): Record<string, unknown> | undefined {
  const locations = (result as { locations?: unknown[] } | undefined)?.locations;
  if (!Array.isArray(locations) || locations.length === 0) {
    return undefined;
  }
  const firstLocation = locations[0];
  return firstLocation && typeof firstLocation === 'object'
    ? (firstLocation as Record<string, unknown>)
    : undefined;
}

function normalizeUri(uri?: string, workspaceRootPath?: string): string | undefined {
  if (!uri) {
    return undefined;
  }
  const portableUri = uri.replace(/\\/g, '/');
  const workspaceRoot = workspaceRootPath?.replace(/\\/g, '/');
  if (portableUri.startsWith('file://')) {
    const filePath = decodeURIComponent(portableUri.replace(/^file:\/\/\/?/, '/'));
    if (workspaceRoot && filePath.startsWith(`${workspaceRoot}/`)) {
      return filePath.slice(workspaceRoot.length + 1);
    }
    return filePath;
  }
  if (workspaceRoot && portableUri.startsWith(`${workspaceRoot}/`)) {
    return portableUri.slice(workspaceRoot.length + 1);
  }
  return portableUri;
}

function compareRules(left: NormalizedSarifRule, right: NormalizedSarifRule): number {
  return left.id.localeCompare(right.id);
}

function compareResults(left: NormalizedSarifResult, right: NormalizedSarifResult): number {
  return (
    left.ruleId.localeCompare(right.ruleId) ||
    (left.uri ?? '').localeCompare(right.uri ?? '') ||
    (left.startLine ?? 0) - (right.startLine ?? 0) ||
    (left.message ?? '').localeCompare(right.message ?? '')
  );
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && !Number.isNaN(value) ? value : undefined;
}

function get(value: unknown, ...keys: string[]): unknown {
  let current = value;
  for (const key of keys) {
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function compactObject<T extends object>(value: T): T {
  const entries = Object.entries(value).filter(([, entryValue]) => {
    if (entryValue === undefined) {
      return false;
    }
    if (Array.isArray(entryValue)) {
      return entryValue.length > 0;
    }
    return true;
  });
  return Object.fromEntries(entries) as T;
}
