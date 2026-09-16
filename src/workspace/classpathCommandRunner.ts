import * as path from 'path';
import { Uri, type CancellationToken } from 'vscode';
import { Logger } from '../core/logger';
import {
  requestJavaClasspaths,
  requestJavaIsTestFile,
  requestJavaProjectSettings,
  type JavaLsClasspathResponse,
} from '../lsp/javaLsGateway';
import type {
  AnalysisResolutionIssue,
  ClasspathLookupOutcome,
} from '../lsp/javaLsOutcome';
import type {
  ClasspathResult,
  ClasspathScope,
  ProjectRef,
} from './classpathTypes';
import {
  isPathInsideOrEqual,
  isWindowsPath,
  pathComparisonKey,
  samePath,
  uniquePaths,
} from './pathIdentity';

const SOURCE_PATHS = 'org.eclipse.jdt.ls.core.sourcePaths';
const OUTPUT_PATH = 'org.eclipse.jdt.ls.core.outputPath';
const CLASSPATH_ENTRIES = 'org.eclipse.jdt.ls.core.classpathEntries';

type SourceOutput = {
  sourcepath: string;
  output?: string;
  declaredOutput?: string;
  test: boolean;
};

type ProjectSettings = {
  defaultOutput?: string;
  sourceOutputs: SourceOutput[];
};

export interface ClasspathLookupOptions {
  logFailures?: boolean;
  scope?: ClasspathScope;
  expectedProjectRoot?: ProjectRef;
  analysisResource?: ProjectRef;
  token?: CancellationToken;
}

export async function lookupJavaProjectClasspath(
  project?: ProjectRef,
  options: ClasspathLookupOptions = {}
): Promise<ClasspathLookupOutcome> {
  const queryUri = uriOf(project);
  if (!queryUri) {
    return unavailable(
      'JAVA_LS_NO_RESULT',
      'Java project metadata lookup requires a file or project URI.'
    );
  }

  const token = options.token;
  try {
    throwIfCancelled(token);
    const resourcePath = pathOf(options.analysisResource ?? project);
    const issues: AnalysisResolutionIssue[] = [];
    let settings: ProjectSettings | undefined;
    let preliminarySettingsIssue: AnalysisResolutionIssue | undefined;
    let scope = options.scope;

    if (!scope && resourcePath?.toLowerCase().endsWith('.java')) {
      try {
        const testFile = await requestJavaIsTestFile(queryUri, token);
        throwIfCancelled(token);
        if (typeof testFile === 'boolean') scope = testFile ? 'test' : 'runtime';
      } catch (error) {
        throwIfCancelled(token);
        logFailure(options, 'isTestFile', error);
      }
    }

    if (!scope) {
      const loaded = await loadSettings(queryUri, token, options);
      settings = loaded.settings;
      preliminarySettingsIssue = loaded.issue;
      scope = inferScope(resourcePath, settings.sourceOutputs);
    }

    const response = normalizeClasspathResponse(
      await requestJavaClasspaths(queryUri, scope, token)
    );
    throwIfCancelled(token);
    if (!response) {
      return unavailable(
        'JAVA_LS_NO_RESULT',
        'Java Language Server returned invalid project classpath metadata.'
      );
    }
    if (
      options.expectedProjectRoot &&
      !sameProjectRoot(options.expectedProjectRoot, response.projectRoot)
    ) {
      return unavailable(
        'JAVA_PROJECT_METADATA_MISMATCH',
        'Java Language Server returned metadata for a different project.'
      );
    }

    const settingsMatchValidatedRoot =
      !!settings &&
      !!options.expectedProjectRoot &&
      sameProjectRoot(options.expectedProjectRoot, response.projectRoot);
    if (!settingsMatchValidatedRoot) {
      const loaded = await loadSettings(response.projectRoot, token, options);
      settings = loaded.settings;
      if (loaded.issue) issues.push(loaded.issue);
    } else if (preliminarySettingsIssue) {
      issues.push(preliminarySettingsIssue);
    }
    const projectSettings = settings ?? { sourceOutputs: [] };

    const selectedSources = selectSources(
      projectSettings.sourceOutputs,
      resourcePath,
      pathOf(response.projectRoot),
      scope
    );
    const sourcepaths = uniquePaths(selectedSources.map((entry) => entry.sourcepath));
    const sourceOutputs = Object.fromEntries(
      selectedSources.flatMap((entry) => {
        const output = entry.declaredOutput ?? entry.output;
        return output ? [[entry.sourcepath, output]] : [];
      })
    );
    const targetResolutionRoots = uniquePaths(
      selectedSources.flatMap((entry) => {
        const output = entry.declaredOutput ?? entry.output;
        return output ? [output] : [];
      })
    );
    if (
      targetResolutionRoots.length === 0 &&
      projectSettings.defaultOutput &&
      (projectSettings.sourceOutputs.length === 0 || selectedSources.length > 0)
    ) {
      targetResolutionRoots.push(projectSettings.defaultOutput);
    }
    const runtimeClasspaths = uniquePaths([
      ...response.classpaths,
      ...response.modulepaths,
    ]);
    if (runtimeClasspaths.length === 0) {
      issues.push({
        code: 'JAVA_LS_EMPTY_RUNTIME_CLASSPATH',
        level: 'warn',
        source: 'java-ls',
        phase: 'get-classpaths',
        message: 'Java LS returned no classpath or modulepath entries.',
      });
    }

    const classpath: ClasspathResult = {
      projectRoot: response.projectRoot,
      runtimeClasspaths,
      targetResolutionRoots,
      sourcepaths,
      sourceOutputs,
    };
    Logger.log(
      `getClasspaths(${scope}) succeeded: projectRoot=${response.projectRoot}, auxPaths=${runtimeClasspaths.length}, targetResolutionRoots=${targetResolutionRoots.length}, sourcepaths=${sourcepaths.length}`
    );
    return { status: 'resolved', classpath, issues };
  } catch (error) {
    throwIfCancelled(token);
    logFailure(options, 'getClasspaths', error);
    return unavailable(
      'JAVA_LS_REQUEST_FAILED',
      'Java project metadata lookup failed.',
      error
    );
  }
}

async function loadSettings(
  uri: string,
  token: CancellationToken | undefined,
  options: ClasspathLookupOptions
): Promise<{ settings: ProjectSettings; issue?: AnalysisResolutionIssue }> {
  try {
    const snapshot = await requestJavaProjectSettings(uri, token);
    throwIfCancelled(token);
    const raw = snapshot?.settings;
    if (!record(raw)) {
      return {
        settings: { sourceOutputs: [] },
        issue: settingsIssue('Java project settings returned no usable result.'),
      };
    }
    const normalized = normalizeSettings(raw, snapshot!.declaredSourceOutputs);
    return {
      settings: normalized.settings,
      ...(normalized.complete
        ? {}
        : {
            issue: settingsIssue(
              'Source-specific outputs were unavailable; using the default project output.'
            ),
          }),
    };
  } catch (error) {
    throwIfCancelled(token);
    logFailure(options, 'getProjectSettings', error);
    return {
      settings: { sourceOutputs: [] },
      issue: settingsIssue(message(error)),
    };
  }
}

function normalizeSettings(raw: Record<string, unknown>, declaredSourceOutputs: Record<string, string>): {
  settings: ProjectSettings;
  complete: boolean;
} {
  const defaultOutput = text(raw[OUTPUT_PATH]);
  const entries = raw[CLASSPATH_ENTRIES];
  const sourceOutputs: SourceOutput[] = [];
  if (Array.isArray(entries)) {
    for (const entry of entries) {
      if (!record(entry) || entry.kind !== 1 || !text(entry.path)) continue;
      const sourcepath = text(entry.path)!;
      sourceOutputs.push({
        sourcepath,
        output: text(entry.output) ?? defaultOutput,
        test: testEntry(sourcepath, entry.attributes),
      });
    }
  }
  for (const sourcepath of strings(raw[SOURCE_PATHS]) ?? []) {
    if (sourceOutputs.some((entry) => samePath(entry.sourcepath, sourcepath))) continue;
    sourceOutputs.push({
      sourcepath,
      output: defaultOutput,
      test: conventionalScope(sourcepath) === 'test',
    });
  }
  // Selection still uses the legacy output; Java's declared output is applied only afterwards.
  for (const [sourcepath, output] of Object.entries(declaredSourceOutputs)) {
    const source = sourceOutputs.find((candidate) => samePath(candidate.sourcepath, sourcepath));
    if (source) source.declaredOutput = output;
  }
  return {
    settings: { defaultOutput, sourceOutputs },
    complete: Array.isArray(entries),
  };
}

function selectSources(
  sources: readonly SourceOutput[],
  resourcePath: string | undefined,
  projectRoot: string | undefined,
  scope: ClasspathScope
): SourceOutput[] {
  const related = resourcePath ? relatedSources(sources, resourcePath) : [];
  const allProjectSources =
    !!resourcePath && !!projectRoot && samePath(resourcePath, projectRoot);
  const selected = related.length > 0 ? related : allProjectSources ? [...sources] : [];
  return scope === 'runtime' ? selected.filter((entry) => !entry.test) : selected;
}

function relatedSources(
  sources: readonly SourceOutput[],
  resourcePath: string
): SourceOutput[] {
  const direct = sources
    .map((entry) => ({ entry, length: ancestorLength(entry, resourcePath) }))
    .filter(({ length }) => length >= 0);
  if (direct.length > 0) {
    const longest = Math.max(...direct.map(({ length }) => length));
    return direct.filter(({ length }) => length === longest).map(({ entry }) => entry);
  }
  return sources.filter((entry) => isPathInsideOrEqual(resourcePath, entry.sourcepath));
}

function ancestorLength(entry: SourceOutput, resourcePath: string): number {
  return [entry.sourcepath, entry.output]
    .filter(
      (candidate): candidate is string =>
        !!candidate && isPathInsideOrEqual(candidate, resourcePath)
    )
    .reduce(
      (longest, candidate) =>
        Math.max(longest, pathComparisonKey(candidate).length),
      -1
    );
}

function inferScope(
  resourcePath: string | undefined,
  sources: readonly SourceOutput[]
): ClasspathScope {
  if (resourcePath) {
    const related = relatedSources(sources, resourcePath);
    if (related.length > 0) return related.some((entry) => entry.test) ? 'test' : 'runtime';
    return conventionalScope(resourcePath);
  }
  return 'runtime';
}

function testEntry(sourcepath: string, attributes: unknown): boolean {
  if (record(attributes)) {
    for (const [name, value] of Object.entries(attributes)) {
      if (typeof value !== 'string') continue;
      if (
        (name.toLowerCase() === 'test' && value.toLowerCase() === 'true') ||
        (name.toLowerCase().includes('scope') && value.toLowerCase().includes('test'))
      ) {
        return true;
      }
    }
  }
  return conventionalScope(sourcepath) === 'test';
}

function conventionalScope(value: string): ClasspathScope {
  const normalized = value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  return /\/(src\/test|target\/test-classes|build\/classes\/java\/test|bin\/test)(\/|$)/.test(
    normalized
  )
    ? 'test'
    : 'runtime';
}

function normalizeClasspathResponse(
  value: unknown
): JavaLsClasspathResponse | undefined {
  if (!record(value)) return undefined;
  const projectRoot = text(value.projectRoot);
  const classpaths = strings(value.classpaths);
  const modulepaths = strings(value.modulepaths);
  return projectRoot && pathOf(projectRoot) && classpaths && modulepaths
    ? { projectRoot, classpaths, modulepaths }
    : undefined;
}

function sameProjectRoot(expected: ProjectRef, actual: ProjectRef): boolean {
  const left = pathOf(expected);
  const right = pathOf(actual);
  return !!left && !!right && samePath(left, right);
}

function uriOf(value: ProjectRef): string {
  if (!value) return '';
  if (typeof value !== 'string') return value.toString();
  return isWindowsPath(value) || path.isAbsolute(value)
    ? Uri.file(value).toString()
    : value;
}

function pathOf(value: ProjectRef): string | undefined {
  if (!value) return undefined;
  if (typeof value !== 'string') return value.scheme === 'file' ? value.fsPath : undefined;
  if (isWindowsPath(value) || path.isAbsolute(value)) return value;
  try {
    const uri = Uri.parse(value);
    return uri.scheme === 'file' ? uri.fsPath : undefined;
  } catch {
    return undefined;
  }
}

function strings(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
    ? value.map((entry) => entry.trim()).filter(Boolean)
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function settingsIssue(cause: string): AnalysisResolutionIssue {
  return {
    code: 'JAVA_LS_PROJECT_SETTINGS_FAILED',
    level: 'warn',
    source: 'java-ls',
    phase: 'get-classpaths',
    message: 'Java project source/output metadata lookup was incomplete.',
    cause,
  };
}

function unavailable(
  code:
    | 'JAVA_LS_REQUEST_FAILED'
    | 'JAVA_LS_NO_RESULT'
    | 'JAVA_PROJECT_METADATA_MISMATCH',
  messageText: string,
  cause?: unknown
): ClasspathLookupOutcome {
  return {
    status: 'unavailable',
    issues: [
      {
        code,
        level: 'warn',
        source: 'java-ls',
        phase: 'get-classpaths',
        message: messageText,
        ...(cause === undefined ? {} : { cause: message(cause) }),
      },
    ],
  };
}

function throwIfCancelled(token: CancellationToken | undefined): void {
  if (token?.isCancellationRequested) throw new Error('Operation cancelled');
}

function logFailure(
  options: ClasspathLookupOptions,
  operation: string,
  error: unknown
): void {
  if (options.logFailures) Logger.log(`${operation} failed: ${message(error)}`);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
