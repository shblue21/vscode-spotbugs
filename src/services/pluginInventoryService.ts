import type { Uri } from 'vscode';
import { SpotBugsLSCommands } from '../constants/commands';
import type { Config } from '../core/config';
import { executeWorkspaceCommand } from '../lsp/javaLsGateway';
import type { AnalysisError } from '../model/analysisProtocol';

export interface PluginInventoryRequest {
  plugins: string[];
}

export type PluginInventoryStatus =
  | 'loadable'
  | 'duplicate-plugin-id'
  | 'load-failed'
  | 'backend-error';

export interface PluginInventoryItem {
  index: number;
  path: string;
  canonicalPath?: string;
  status: PluginInventoryStatus;
  pluginId?: string;
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

  if (!isRecord(parsed)) {
    return invalidResponse();
  }

  const hasResults = Object.prototype.hasOwnProperty.call(parsed, 'results');
  const hasErrors = Object.prototype.hasOwnProperty.call(parsed, 'errors');
  if (!hasResults && !hasErrors) {
    return invalidResponse();
  }
  if (hasResults && !Array.isArray(parsed.results)) {
    return invalidResponse();
  }
  if (hasErrors && !Array.isArray(parsed.errors)) {
    return invalidResponse();
  }

  const items = hasResults ? normalizeItems(parsed.results as unknown[]) : [];
  const errors = hasErrors ? normalizeErrors(parsed.errors) : undefined;
  if (!hasResults && Array.isArray(errors) && errors.length === 0) {
    return invalidResponse();
  }

  return {
    ok: true,
    value: {
      items,
      errors,
    },
  };
}

function normalizeItems(values: unknown[]): PluginInventoryItem[] {
  const items: PluginInventoryItem[] = [];
  for (const value of values) {
    if (!isRecord(value)) {
      continue;
    }

    const index = typeof value.index === 'number' ? value.index : items.length;
    const path = typeof value.path === 'string' ? value.path : '';
    const canonicalPath =
      typeof value.canonicalPath === 'string' ? value.canonicalPath : undefined;

    items.push({
      index,
      path,
      canonicalPath,
      status: normalizeStatus(value.status),
      pluginId: typeof value.pluginId === 'string' ? value.pluginId : undefined,
      errorMessage:
        typeof value.errorMessage === 'string' ? value.errorMessage : undefined,
    });
  }
  return items;
}

function normalizeStatus(value: unknown): PluginInventoryStatus {
  switch (value) {
    case 'LOADABLE':
      return 'loadable';
    case 'DUPLICATE_PLUGIN_ID':
      return 'duplicate-plugin-id';
    case 'LOAD_FAILED':
      return 'load-failed';
    default:
      return 'backend-error';
  }
}

function normalizeErrors(value: unknown): AnalysisError[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const errors: AnalysisError[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }
    const error: AnalysisError = {};
    if (typeof item.code === 'string') {
      error.code = item.code;
    }
    if (typeof item.message === 'string') {
      error.message = item.message;
    }
    if (error.code || error.message) {
      errors.push(error);
    }
  }
  return errors;
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
  config: Pick<Config, 'getAnalysisSettings'>,
  resource?: Uri,
  deps: PluginInventoryServiceDeps = {}
): Promise<PluginInventoryResult> {
  const plugins = config.getAnalysisSettings(resource).plugins?.slice() ?? [];
  if (plugins.length === 0) {
    return { items: [] };
  }

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
      items: parsed.value.items.map((item, fallbackIndex) =>
        withConfiguredPathFallback(item, plugins, fallbackIndex)
      ),
    };
  } catch (error) {
    return backendFailure(plugins, errorMessage(error));
  }
}

function withConfiguredPathFallback(
  item: PluginInventoryItem,
  plugins: string[],
  fallbackIndex: number
): PluginInventoryItem {
  const index = item.index >= 0 ? item.index : fallbackIndex;
  return {
    ...item,
    index,
    path: item.path || plugins[index] || '',
  };
}

function backendFailure(plugins: string[], message: string): PluginInventoryResult {
  return {
    items: plugins.map((pluginPath, index) => ({
      index,
      path: pluginPath,
      status: 'backend-error',
      errorMessage: message,
    })),
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
