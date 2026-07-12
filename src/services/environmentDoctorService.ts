import * as path from 'path';
import * as fs from 'fs';
import { Uri, WorkspaceFolder, l10n, workspace } from 'vscode';
import type { AnalysisSettings, Config } from '../core/config';
import type { AnalysisResolutionIssue } from '../lsp/javaLsOutcome';
import type { AnalysisError } from '../model/analysisProtocol';
import {
  validateExtraAuxClasspathPreflight,
  validateFilterFilesPreflight,
} from './filterFileValidation';
import { getPluginInventory } from './pluginInventoryService';
import {
  createTargetResolver,
  resolveProjectAnalysisTargetDetailed,
} from '../workspace/analysisTargetResolver';
import { getClasspathsOutcome } from '../workspace/classpathService';
import { getWorkspaceProjectDiscovery } from '../workspace/projectDiscovery';

export type EnvironmentDoctorLevel = 'pass' | 'info' | 'warning' | 'error';

export interface EnvironmentDoctorCheck {
  level: EnvironmentDoctorLevel;
  label: string;
  detail?: string;
}

export interface EnvironmentDoctorDeps {
  getWorkspaceProjectDiscovery: typeof getWorkspaceProjectDiscovery;
  resolveProjectAnalysisTargetDetailed: typeof resolveProjectAnalysisTargetDetailed;
  validateFilterFilesPreflight: typeof validateFilterFilesPreflight;
  validateExtraAuxClasspathPreflight: typeof validateExtraAuxClasspathPreflight;
  getPluginInventory: typeof getPluginInventory;
  validatePathEntries: typeof validatePathEntries;
}

export function createDoctorTargetResolver(
  lookup: typeof getClasspathsOutcome = getClasspathsOutcome
) {
  return createTargetResolver({
    getClasspathsOutcome: (project, options) =>
      lookup(project, { ...options, strictProject: true }),
    primeSourcepathsCache: () => undefined,
  });
}

const doctorTargetResolver = createDoctorTargetResolver();

const defaultDeps: EnvironmentDoctorDeps = {
  getWorkspaceProjectDiscovery,
  resolveProjectAnalysisTargetDetailed:
    doctorTargetResolver.resolveProjectAnalysisTargetDetailed,
  validateFilterFilesPreflight,
  validateExtraAuxClasspathPreflight,
  getPluginInventory,
  validatePathEntries,
};

export async function inspectAnalysisEnvironment(
  config: Pick<Config, 'getAnalysisSettings'>,
  workspaceFolder: WorkspaceFolder,
  overrides: Partial<EnvironmentDoctorDeps> = {}
): Promise<EnvironmentDoctorCheck[]> {
  const deps = { ...defaultDeps, ...overrides };
  const checks: EnvironmentDoctorCheck[] = [];
  const discovery = await deps.getWorkspaceProjectDiscovery(workspaceFolder.uri);
  const usedWorkspaceFallback = discovery.issues.some(
    (issue) => issue.code === 'WORKSPACE_FALLBACK_USED'
  );
  const discoveryWarning = discovery.issues.find((issue) => issue.level === 'warn');
  const projectUris = discovery.projectUris.map((uriString) => Uri.parse(uriString));

  checks.push({
    level: discoveryWarning ? 'warning' : usedWorkspaceFallback ? 'info' : 'pass',
    label: l10n.t('Java project discovery'),
    detail: discoveryWarning
      ? issueMessage(discoveryWarning)
      : usedWorkspaceFallback
      ? l10n.t('Java projects were unavailable; using the workspace folder fallback.')
      : l10n.t('{0} Java projects discovered.', projectUris.length),
  });

  for (const projectUri of projectUris) {
    const projectName = path.basename(projectUri.fsPath) || projectUri.toString();
    try {
      const result = await deps.resolveProjectAnalysisTargetDetailed(
        projectUri,
        workspaceFolder.uri
      );
      for (const issue of result.issues.filter(
        (candidate) =>
          candidate.code !== 'OUTPUT_FALLBACK_USED' &&
          candidate.code !== 'JAVA_LS_EMPTY_RUNTIME_CLASSPATH'
      )) {
        checks.push({
          level: issue.level === 'warn' ? 'warning' : 'info',
          label: l10n.t('{0}: Project metadata', projectName),
          detail: issueMessage(issue),
        });
      }
      if (result.resolution.status !== 'ok') {
        checks.push({
          level: 'error',
          label: l10n.t('{0}: Build output', projectName),
          detail: result.resolution.message,
        });
        continue;
      }

      const target = result.resolution.target;
      const usedOutputFallback = result.issues.some(
        (issue) => issue.code === 'OUTPUT_FALLBACK_USED'
      );
      checks.push({
        level: usedOutputFallback ? 'info' : 'pass',
        label: l10n.t('{0}: Build output', projectName),
        detail: usedOutputFallback
          ? l10n.t('Using fallback output: {0}', target.targetPath)
          : target.targetPath,
      });
      checks.push(
        await pathCheck(
          projectName,
          'Runtime classpath',
          target.runtimeClasspaths,
          deps.validatePathEntries
        ),
        await pathCheck(
          projectName,
          'Source mapping',
          target.sourcepaths,
          deps.validatePathEntries
        )
      );
    } catch (error) {
      checks.push({
        level: 'error',
        label: l10n.t('{0}: Project metadata', projectName),
        detail: errorMessage(error),
      });
    }
  }

  const configurations = uniqueConfigurations(config, projectUris, workspaceFolder);
  for (const configuration of configurations) {
    const { resource, settings } = configuration;
    const [filterError, auxClasspathError, pluginInventory] = await Promise.all([
      deps.validateFilterFilesPreflight(settings),
      deps.validateExtraAuxClasspathPreflight(settings),
      deps.getPluginInventory(config, resource),
    ]);
    const scopedLabel = (label: string) =>
      configurations.length > 1 ? l10n.t('{0}: {1}', configuration.name, label) : label;

    checks.push(
      configuredPathCheck(
        scopedLabel(l10n.t('Filter files')),
        countConfiguredFilters(settings),
        filterError
      ),
      configuredPathCheck(
        scopedLabel(l10n.t('Extra auxiliary classpath')),
        settings.extraAuxClasspaths?.length ?? 0,
        auxClasspathError
      )
    );

    if (pluginInventory.items.length === 0) {
      checks.push({
        level: 'info',
        label: scopedLabel(l10n.t('SpotBugs plugins')),
        detail: l10n.t('No paths configured.'),
      });
    } else {
      for (const plugin of pluginInventory.items) {
        const pluginStatus: string = plugin.status;
        checks.push({
          level:
            pluginStatus === 'validated' || pluginStatus === 'loadable'
              ? 'info'
              : pluginStatus === 'backend-error'
                ? 'warning'
                : 'error',
          label: scopedLabel(
            l10n.t('Plugin: {0}', path.basename(plugin.path || plugin.canonicalPath || ''))
          ),
          detail:
            pluginStatus === 'validated' || pluginStatus === 'loadable'
              ? validatedPluginDetail(plugin.pluginId)
              : plugin.errorMessage ?? plugin.pluginId ?? plugin.canonicalPath ?? plugin.path,
        });
      }
    }
  }

  return checks;
}

async function pathCheck(
  projectName: string,
  kind: 'Runtime classpath' | 'Source mapping',
  values: string[] | undefined,
  validate: typeof validatePathEntries
): Promise<EnvironmentDoctorCheck> {
  const count = values?.length ?? 0;
  const kindLabel =
    kind === 'Runtime classpath' ? l10n.t('Runtime classpath') : l10n.t('Source mapping');
  const unavailable = count > 0 ? await validate(values ?? []) : [];
  return {
    level: count > 0 && unavailable.length === 0 ? 'pass' : 'warning',
    label: l10n.t('{0}: {1}', projectName, kindLabel),
    detail:
      unavailable.length > 0
        ? l10n.t(
            '{0} of {1} entries unavailable: {2}',
            unavailable.length,
            count,
            unavailable.slice(0, 3).join(', ')
          )
        : count > 0
        ? l10n.t('{0} entries available.', count)
        : l10n.t('No entries available; analysis results may be incomplete.'),
  };
}

export async function validatePathEntries(values: string[]): Promise<string[]> {
  const unavailable: string[] = [];
  for (const value of values) {
    try {
      const stat = await fs.promises.stat(value);
      if (!stat.isFile() && !stat.isDirectory()) {
        unavailable.push(value);
        continue;
      }
      await fs.promises.access(value, fs.constants.R_OK);
    } catch {
      unavailable.push(value);
    }
  }
  return unavailable;
}

function uniqueConfigurations(
  config: Pick<Config, 'getAnalysisSettings'>,
  projectUris: Uri[],
  workspaceFolder: WorkspaceFolder
): Array<{ resource: Uri; name: string; settings: AnalysisSettings }> {
  const configurations = new Map<
    string,
    { resource: Uri; name: string; settings: AnalysisSettings }
  >();
  for (const projectUri of projectUris.length > 0 ? projectUris : [workspaceFolder.uri]) {
    const folder = workspace.getWorkspaceFolder(projectUri);
    const resource = folder?.uri ?? projectUri;
    const settings = config.getAnalysisSettings(resource);
    const key = JSON.stringify(settings);
    if (!configurations.has(key)) {
      configurations.set(key, {
        resource,
        name: folder?.name ?? (path.basename(resource.fsPath) || resource.toString()),
        settings,
      });
    }
  }
  return [...configurations.values()];
}

function issueMessage(issue: AnalysisResolutionIssue): string {
  return issue.cause ? `${issue.message} (${issue.cause})` : issue.message;
}

function validatedPluginDetail(pluginId?: string): string {
  const validated = pluginId ? `${l10n.t('Validated')}: ${pluginId}.` : `${l10n.t('Validated')}.`;
  return `${validated} ${l10n.t('Runtime loading was not checked.')}`;
}

function configuredPathCheck(
  label: string,
  count: number,
  error: AnalysisError | undefined
): EnvironmentDoctorCheck {
  if (error) {
    return {
      level: 'error',
      label,
      detail: error.message ?? error.code,
    };
  }
  return {
    level: count > 0 ? 'pass' : 'info',
    label,
    detail: count > 0 ? l10n.t('{0} paths validated.', count) : l10n.t('No paths configured.'),
  };
}

function countConfiguredFilters(
  settings: ReturnType<Config['getAnalysisSettings']>
): number {
  return (
    (settings.includeFilterPaths?.length ?? 0) +
    (settings.excludeFilterPaths?.length ?? 0) +
    (settings.excludeBaselineBugsPaths?.length ?? 0)
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : String(error);
}
