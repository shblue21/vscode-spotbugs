import * as assert from 'assert';
import type { Uri, WorkspaceFolder } from 'vscode';
import type { AnalysisSettings } from '../core/config';
import type { EnvironmentDoctorDeps } from '../services/environmentDoctorService';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';

installVscodeMock();
const { createDoctorTargetResolver, inspectAnalysisEnvironment, validatePathEntries } = require(
  '../services/environmentDoctorService'
) as typeof import('../services/environmentDoctorService');

function config(settings: AnalysisSettings) {
  return {
    getAnalysisSettings: (_resource?: Uri) => settings,
  };
}

function workspaceFolder(): WorkspaceFolder {
  const vscode = resetVscodeMock();
  return {
    index: 0,
    name: 'workspace',
    uri: vscode.Uri.file('/workspace') as unknown as Uri,
  };
}

describe('environmentDoctorService', () => {
  it('uses strict project lookup in the doctor resolver', async () => {
    const vscode = resetVscodeMock();
    let strictProject: boolean | undefined;
    const resolver = createDoctorTargetResolver(async (_project, options) => {
      strictProject = options?.strictProject;
      return { status: 'unavailable', issues: [] };
    });

    await resolver.resolveProjectAnalysisTargetDetailed(
      vscode.Uri.file('/missing-project') as never,
      vscode.Uri.file('/workspace') as never
    );

    assert.strictEqual(strictProject, true);
  });

  it('reports healthy project metadata and a validated plugin', async () => {
    const folder = workspaceFolder();
    const projectUri = 'file:///workspace/project';
    const checks = await inspectAnalysisEnvironment(
      config({ effort: 'default', plugins: ['/workspace/plugin.jar'] }),
      folder,
      {
        getWorkspaceProjectDiscovery: async () => ({
          projectUris: [projectUri],
          issues: [],
        }),
        resolveProjectAnalysisTargetDetailed: async () => ({
          resolution: {
            status: 'ok',
            target: {
              targetPath: '/workspace/project/target/classes',
              runtimeClasspaths: ['/workspace/dependency.jar'],
              sourcepaths: ['/workspace/project/src/main/java'],
            },
          },
          issues: [],
        }),
        validateFilterFilesPreflight: async () => undefined,
        validateExtraAuxClasspathPreflight: async () => undefined,
        getPluginInventory: async () => ({
          items: [
            {
              index: 0,
              path: '/workspace/plugin.jar',
              status: 'validated' as never,
              pluginId: 'com.example.plugin',
            },
          ],
        }),
        validatePathEntries: async () => [],
      } as Partial<EnvironmentDoctorDeps>
    );

    assert.deepStrictEqual(
      checks.map((check) => [check.level, check.label]),
      [
        ['pass', 'Java project discovery'],
        ['pass', 'project: Build output'],
        ['pass', 'project: Runtime classpath'],
        ['pass', 'project: Source mapping'],
        ['info', 'Filter files'],
        ['info', 'Extra auxiliary classpath'],
        ['info', 'Plugin: plugin.jar'],
      ]
    );
    assert.strictEqual(
      checks.find((check) => check.label === 'Plugin: plugin.jar')?.detail,
      'Validated: com.example.plugin. Runtime loading was not checked.'
    );
  });

  it('keeps independent configuration and project failures visible', async () => {
    const folder = workspaceFolder();
    const checks = await inspectAnalysisEnvironment(
      config({
        effort: 'default',
        includeFilterPaths: ['/workspace/missing.xml'],
        extraAuxClasspaths: ['/workspace/dependency.jar'],
        plugins: ['/workspace/bad.jar'],
      }),
      folder,
      {
        getWorkspaceProjectDiscovery: async () => ({
          projectUris: ['file:///workspace/project'],
          issues: [
            {
              code: 'WORKSPACE_FALLBACK_USED',
              level: 'info',
              source: 'project-discovery',
              phase: 'workspace-fallback',
              message: 'fallback',
            },
          ],
        }),
        resolveProjectAnalysisTargetDetailed: async () => ({
          resolution: {
            status: 'no-class-targets',
            errorCode: 'NO_CLASS_TARGETS',
            message: 'No compiled classes found.',
          },
          issues: [],
        }),
        validateFilterFilesPreflight: async () => ({
          code: 'CFG_FILTER_NOT_FOUND',
          message: 'Filter file not found.',
        }),
        validateExtraAuxClasspathPreflight: async () => undefined,
        getPluginInventory: async () => ({
          items: [
            {
              index: 0,
              path: '/workspace/bad.jar',
              status: 'duplicate-plugin-id',
              errorMessage: 'Duplicate plugin id.',
            },
          ],
        }),
      } as Partial<EnvironmentDoctorDeps>
    );

    assert.deepStrictEqual(
      checks.map((check) => [check.level, check.label]),
      [
        ['info', 'Java project discovery'],
        ['error', 'project: Build output'],
        ['error', 'Filter files'],
        ['pass', 'Extra auxiliary classpath'],
        ['error', 'Plugin: bad.jar'],
      ]
    );
  });

  it('reports Java LS warnings and unavailable metadata paths', async () => {
    const folder = workspaceFolder();
    const checks = await inspectAnalysisEnvironment(config({ effort: 'default' }), folder, {
      getWorkspaceProjectDiscovery: async () => ({
        projectUris: ['file:///workspace/project'],
        issues: [],
      }),
      resolveProjectAnalysisTargetDetailed: async () => ({
        resolution: {
          status: 'ok',
          target: {
            targetPath: '/workspace/project/target/classes',
            runtimeClasspaths: ['/workspace/missing.jar'],
            sourcepaths: ['/workspace/project/src/main/java'],
          },
        },
        issues: [
          {
            code: 'JAVA_LS_REQUEST_FAILED',
            level: 'warn',
            source: 'java-ls',
            phase: 'get-classpaths',
            message: 'Java LS classpath lookup failed.',
          },
          {
            code: 'JAVA_LS_EMPTY_RUNTIME_CLASSPATH',
            level: 'warn',
            source: 'java-ls',
            phase: 'get-classpaths',
            message: 'Java LS returned no runtime classpath entries.',
          },
        ],
      }),
      validateFilterFilesPreflight: async () => undefined,
      validateExtraAuxClasspathPreflight: async () => undefined,
      getPluginInventory: async () => ({ items: [] }),
      validatePathEntries: async (values) =>
        values.filter((value) => value.endsWith('missing.jar')),
    } as Partial<EnvironmentDoctorDeps>);

    assert.ok(
      checks.some(
        (check) =>
          check.level === 'warning' && check.label === 'project: Project metadata'
      )
    );
    assert.ok(
      checks.some(
        (check) =>
          check.level === 'warning' && check.label === 'project: Runtime classpath'
      )
    );
    assert.strictEqual(checks.filter((check) => check.level === 'warning').length, 2);
  });

  it('keeps workspace fallback checks aligned with project discovery', async () => {
    const vscode = resetVscodeMock();
    const workspaceA = vscode.Uri.file('/workspace-a');
    const workspaceB = vscode.Uri.file('/workspace-b');
    resetVscodeMock({
      workspace: {
        workspaceFolders: [
          { name: 'workspace-a', uri: workspaceA },
          { name: 'workspace-b', uri: workspaceB },
        ],
      },
    } as never);
    const resources: string[] = [];
    const folder = {
      index: 0,
      name: 'workspace-a',
      uri: workspaceA as unknown as Uri,
    } as WorkspaceFolder;

    const checks = await inspectAnalysisEnvironment(
      {
        getAnalysisSettings: (resource?: Uri) => ({
          effort: 'default',
          plugins: [`${resource?.fsPath}/plugin.jar`],
        }),
      },
      folder,
      {
        getWorkspaceProjectDiscovery: async () => ({
          projectUris: [workspaceA.toString()],
          issues: [
            {
              code: 'WORKSPACE_FALLBACK_USED',
              level: 'info',
              source: 'project-discovery',
              phase: 'workspace-fallback',
              message: 'fallback',
            },
          ],
        }),
        resolveProjectAnalysisTargetDetailed: async () => ({
          resolution: {
            status: 'no-class-targets',
            errorCode: 'NO_CLASS_TARGETS',
            message: 'No compiled classes found.',
          },
          issues: [],
        }),
        validateFilterFilesPreflight: async () => undefined,
        validateExtraAuxClasspathPreflight: async () => undefined,
        getPluginInventory: async (_config, resource) => {
          resources.push(resource?.fsPath ?? '');
          return { items: [] };
        },
      } as Partial<EnvironmentDoctorDeps>
    );

    assert.deepStrictEqual(resources, ['/workspace-a']);
    assert.ok(checks.some((check) => check.label === 'Filter files'));
    assert.ok(!checks.some((check) => check.label.includes('workspace-b')));
  });

  it('validates that metadata paths exist and are readable filesystem entries', async () => {
    const unavailable = await validatePathEntries([
      __filename,
      `${__filename}.missing`,
    ]);

    assert.deepStrictEqual(unavailable, [`${__filename}.missing`]);
  });
});

describe('environmentDoctorCommand', () => {
  const service = require(
    '../services/environmentDoctorService'
  ) as typeof import('../services/environmentDoctorService');
  const roots = require('../workspace/workspaceRoots') as typeof import('../workspace/workspaceRoots');
  const originalInspect = service.inspectAnalysisEnvironment;
  const originalGetPrimaryWorkspaceFolder = roots.getPrimaryWorkspaceFolder;

  afterEach(() => {
    service.inspectAnalysisEnvironment = originalInspect;
    roots.getPrimaryWorkspaceFolder = originalGetPrimaryWorkspaceFolder;
    delete require.cache[require.resolve('../commands/environmentDoctor')];
  });

  it('shows an error when no workspace is open', async () => {
    let message: string | undefined;
    resetVscodeMock({
      window: { showErrorMessage: async (value: string) => (message = value) },
    } as never);
    roots.getPrimaryWorkspaceFolder = () => undefined;
    const { runEnvironmentDoctor } = require(
      '../commands/environmentDoctor'
    ) as typeof import('../commands/environmentDoctor');

    await runEnvironmentDoctor({} as never);

    assert.strictEqual(message, 'Open a workspace to check SpotBugs setup.');
  });

  it('shows the environment summary in a QuickPick', async () => {
    const folder = workspaceFolder();
    let placeHolder: string | undefined;
    let labels: string[] = [];
    resetVscodeMock({
      window: {
        showQuickPick: async (items: Array<{ label: string }>, options: { placeHolder?: string }) => {
          labels = items.map((item) => item.label);
          placeHolder = options.placeHolder;
          return undefined;
        },
      },
    } as never);
    roots.getPrimaryWorkspaceFolder = () => folder;
    service.inspectAnalysisEnvironment = async () => [
      { level: 'error', label: 'Build output' },
      { level: 'warning', label: 'Runtime classpath' },
    ];
    const { runEnvironmentDoctor } = require(
      '../commands/environmentDoctor'
    ) as typeof import('../commands/environmentDoctor');

    await runEnvironmentDoctor({} as never);

    assert.deepStrictEqual(labels, ['$(error) Build output', '$(warning) Runtime classpath']);
    assert.strictEqual(placeHolder, '1 errors and 1 warnings found.');
  });

  it('shows service failures as command errors', async () => {
    const folder = workspaceFolder();
    let message: string | undefined;
    resetVscodeMock({
      window: { showErrorMessage: async (value: string) => (message = value) },
    } as never);
    roots.getPrimaryWorkspaceFolder = () => folder;
    service.inspectAnalysisEnvironment = async () => {
      throw new Error('doctor failed');
    };
    const { runEnvironmentDoctor } = require(
      '../commands/environmentDoctor'
    ) as typeof import('../commands/environmentDoctor');

    await runEnvironmentDoctor({} as never);

    assert.strictEqual(
      message,
      'Failed to check SpotBugs analysis environment: doctor failed'
    );
  });
});
