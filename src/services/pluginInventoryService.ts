import type { Uri } from 'vscode';
import { SpotBugsLSCommands } from '../constants/commands';
import type { Config } from '../core/config';
import { decodeCommandResponseEnvelope } from '../lsp/commandResponseEnvelope';
import { executeWorkspaceCommand } from '../lsp/javaLsGateway';
import type { AnalysisError } from '../model/analysisProtocol';

export type PluginConfigurationReader = Pick<Config, 'getConfiguredPlugins'> &
  Partial<Pick<Config, 'getPluginConfigurationError'>>;

export interface PluginInventoryRequest {
  plugins: string[];
}

export type PluginInventoryStatus =
  | 'validated'
  | 'duplicate-plugin-id'
  | 'validation-failed'
  | 'backend-error';

export interface DetectorInventoryItem {
  className: string;
  defaultEnabled: boolean;
  reports: string[];
}

export interface PluginInventoryItem {
  registrationId?: string;
  detectors?: DetectorInventoryItem[];
  index: number;
  path: string;
  canonicalPath?: string;
  status?: PluginInventoryStatus;
  configuredPath?: string;
  enabled?: boolean;
  configurationTarget?: 'global' | 'workspace';
  pluginId?: string;
  shortDescription?: string;
  provider?: string;
  website?: string;
  version?: string;
  detectorCount?: number;
  bugPatternCount?: number;
  bugPatternTypes?: readonly string[];
  errorMessage?: string;
}

export interface PluginInventoryResult {
  items: PluginInventoryItem[];
  errors?: AnalysisError[];
}

export async function runPluginInventory(
  request: PluginInventoryRequest
): Promise<string | undefined> {
  return executeWorkspaceCommand<string>(
    SpotBugsLSCommands.PLUGIN_INVENTORY,
    JSON.stringify(request)
  );
}

export type PluginInventoryParseResult =
  | { ok: true; value: PluginInventoryResult }
  | { ok: false; message: string };

const INVALID_RESPONSE_MESSAGE = 'Invalid plugin inventory response payload.';

export function parsePluginInventoryResponse(raw: string): PluginInventoryParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return invalidResponse();
  }

  const decoded = decodeCommandResponseEnvelope(parsed);
  if (!decoded) {
    return invalidResponse();
  }

  const resultValues = decoded.results ?? [];
  if (
    resultValues.some(
      (value) => !isRecord(value) || !Number.isInteger(value.index) ||
        (value.detectors !== undefined && !isDetectorInventory(value.detectors))
    )
  ) {
    return invalidResponse();
  }

  const items = normalizeItems(resultValues);

  return {
    ok: true,
    value: {
      items,
      errors: decoded.errors,
    },
  };
}

function isDetectorInventory(value: unknown): value is DetectorInventoryItem[] {
  return Array.isArray(value) && value.every((detector) => isRecord(detector) &&
    typeof detector.className === 'string' && !!detector.className.trim() &&
    typeof detector.defaultEnabled === 'boolean' && Array.isArray(detector.reports) &&
    detector.reports.every((report) => typeof report === 'string'));
}

function normalizeItems(values: unknown[]): PluginInventoryItem[] {
  const items: PluginInventoryItem[] = [];
  for (const value of values) {
    if (!isRecord(value)) {
      continue;
    }

    const index = value.index as number;
    const path = typeof value.path === 'string' ? value.path : '';
    const canonicalPath =
      typeof value.canonicalPath === 'string' ? value.canonicalPath : undefined;

    items.push({
      index,
      detectors: Array.isArray(value.detectors) ? value.detectors as DetectorInventoryItem[] : undefined,
      path,
      canonicalPath,
      status: normalizeStatus(value.status),
      pluginId: typeof value.pluginId === 'string' ? value.pluginId : undefined,
      shortDescription: optionalNonBlankString(value.shortDescription),
      provider: optionalNonBlankString(value.provider),
      website: optionalNonBlankString(value.website),
      version: optionalNonBlankString(value.version),
      detectorCount: optionalCount(value.detectorCount),
      bugPatternCount: optionalCount(value.bugPatternCount),
      bugPatternTypes: optionalNonBlankStrings(value.bugPatternTypes),
      errorMessage:
        typeof value.errorMessage === 'string' ? value.errorMessage : undefined,
    });
  }
  return items;
}

function optionalNonBlankString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function optionalCount(value: unknown): number | undefined {
  return Number.isInteger(value) && (value as number) >= 0
    ? (value as number)
    : undefined;
}

function optionalNonBlankStrings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const values = value.map(optionalNonBlankString);
  return values.every((item): item is string => item !== undefined)
    ? values
    : undefined;
}

function normalizeStatus(value: unknown): PluginInventoryStatus {
  switch (value) {
    case 'VALIDATED':
      return 'validated';
    case 'DUPLICATE_PLUGIN_ID':
      return 'duplicate-plugin-id';
    case 'VALIDATION_FAILED':
      return 'validation-failed';
    default:
      return 'backend-error';
  }
}

function invalidResponse(): PluginInventoryParseResult {
  return {
    ok: false,
    message: INVALID_RESPONSE_MESSAGE,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export interface PluginInventoryServiceDeps {
  runPluginInventory?: (request: PluginInventoryRequest) => Promise<string | undefined>;
  parsePluginInventoryResponse?: typeof parsePluginInventoryResponse;
}

export async function getPluginInventory(
  config: PluginConfigurationReader,
  resource?: Uri,
  deps: PluginInventoryServiceDeps = {}
): Promise<PluginInventoryResult> {
  const configurationError = config.getPluginConfigurationError?.();
  if (configurationError) {
    return {
      items: [],
      errors: [{ code: 'CFG_PLUGINS_INVALID', message: configurationError }],
    };
  }
  const configured = config.getConfiguredPlugins(resource);
  const plugins = configured.filter((plugin) => plugin.enabled).map((plugin) => plugin.resolvedPath);
  const inspected = await inspectPlugins(plugins, deps);
  let activeIndex = 0;
  return {
    ...inspected,
    items: [...inspected.items.filter((item) => item.index === -1), ...configured.map((plugin, index) => {
      const inspectedIndex = plugin.enabled ? activeIndex++ : undefined;
      return {
      ...(plugin.enabled ? inspected.items.find((item) => item.index === inspectedIndex) : {}),
      index,
      registrationId: plugin.id,
      path: plugin.resolvedPath,
      configuredPath: plugin.path,
      enabled: plugin.enabled,
      configurationTarget: plugin.target,
    }; })],
  };
}

async function inspectPlugins(
  plugins: string[],
  deps: PluginInventoryServiceDeps,
): Promise<PluginInventoryResult> {

  const request: PluginInventoryRequest = {
    plugins,
  };
  const execute = deps.runPluginInventory ?? runPluginInventory;
  const parse = deps.parsePluginInventoryResponse ?? parsePluginInventoryResponse;

  try {
    const raw = await execute(request);
    if (!raw) {
      return backendFailure(plugins, 'Java language server returned no plugin inventory.');
    }

    const parsed = parse(raw);
    if (!parsed.ok) {
      return backendFailure(plugins, parsed.message);
    }

    if (parsed.value.errors && parsed.value.errors.length > 0) {
      return backendFailure(plugins, formatErrors(parsed.value.errors));
    }

    return {
      ...parsed.value,
      items: completeInventoryItems(parsed.value.items, plugins),
    };
  } catch (error) {
    return backendFailure(plugins, errorMessage(error));
  }
}

function completeInventoryItems(
  items: PluginInventoryItem[],
  plugins: string[]
): PluginInventoryItem[] {
  const seen = new Set<number>();
  if (
    items.some((item) => {
      const invalid =
        !Number.isInteger(item.index) ||
        item.index < -1 ||
        item.index >= plugins.length ||
        seen.has(item.index);
      seen.add(item.index);
      return invalid;
    })
  ) {
    return backendFailure(plugins, 'Plugin inventory returned invalid indexes.').items;
  }
  const itemsByIndex = new Map(
    items.map((item) => [item.index, { ...item, path: item.path || plugins[item.index] }] as const)
  );
  return [items.find((item) => item.index === -1) ?? {
    index: -1, path: '', status: 'backend-error', errorMessage: 'Java language server omitted the core detector inventory.',
  }, ...plugins.map<PluginInventoryItem>(
    (pluginPath, index) =>
      itemsByIndex.get(index) ?? {
        index,
        path: pluginPath,
        status: 'backend-error',
        errorMessage: 'Java language server omitted this plugin inventory result.',
      }
  )];
}

function backendFailure(plugins: string[], message: string): PluginInventoryResult {
  return {
    items: [{ index: -1, path: '', status: 'backend-error', errorMessage: message }, ...plugins.map<PluginInventoryItem>((pluginPath, index) => ({
      index,
      path: pluginPath,
      status: 'backend-error',
      errorMessage: message,
    }))],
    errors: [{ message }],
  };
}

function formatErrors(errors: AnalysisError[]): string {
  return errors
    .map((error) => {
      const code = error.code ? `[${error.code}] ` : '';
      return `${code}${error.message ?? 'Plugin inventory failed'}`;
    })
    .join('; ');
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return String(error || 'Plugin inventory failed');
}
