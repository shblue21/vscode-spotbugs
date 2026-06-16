import * as assert from 'assert';
import type { Uri } from 'vscode';
import {
  runFileAnalysisSession,
  runWorkspaceAnalysisSession,
} from '../orchestration/analysisRunSession';
import type {
  AnalysisProgressRunner,
  AnalysisSessionDependencies,
  RunWorkspaceAnalysisSessionArgs,
} from '../orchestration/analysisRunSession';
import type { Finding } from '../model/finding';
import type { ProjectResult } from '../services/projectResult';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';

installVscodeMock();

function createFinding(file = '/workspace/src/Foo.java'): Finding {
  return {
    patternId: 'NP_NULL_ON_SOME_PATH',
    type: 'NP_NULL_ON_SOME_PATH',
    category: 'CORRECTNESS',
    message: 'Possible null pointer dereference',
    rank: 10,
    priority: '2',
    location: {
      fullPath: file,
      startLine: 7,
      endLine: 7,
    },
  };
}

function createBaseDependencies(
  vscode: ReturnType<typeof installVscodeMock>
): AnalysisSessionDependencies {
  return {
    analyzeFileDetailed: async () => ({
      outcome: {
        findings: [],
        targetPath: '/workspace/src/Foo.java',
      },
      context: {
        resolutionIssues: [],
      },
    }),
    analyzeWorkspaceFromProjectsDetailed: async () => ({
      results: [],
      context: {
        resolutionIssues: [],
      },
    }),
    buildWorkspaceAuto: async () => 0,
    getPrimaryWorkspaceFolder: () =>
      ({
        uri: vscode.Uri.file('/workspace') as unknown as Uri,
      }) as any,
    getWorkspaceProjectDiscovery: async () => ({
      projectUris: [],
      issues: [],
    }),
    logger: {
      log: () => undefined,
      error: () => undefined,
    },
    now: () => 1100,
  };
}

describe('analysisRunSession file analysis', () => {
  beforeEach(() => {
    resetVscodeMock();
  });

  it('applies successful file analysis results and diagnostics', async () => {
    const vscode = installVscodeMock();
    const uri = vscode.Uri.file('/workspace/src/Foo.java') as unknown as Uri;
    const finding = createFinding();
    const calls: string[] = [];
    const infos: string[] = [];
    const config = { getAnalysisSettings: () => ({}) } as any;
    let receivedConfig: unknown;
    let receivedUri: unknown;
    const deps = createBaseDependencies(vscode);
    deps.analyzeFileDetailed = async (actualConfig, actualUri) => {
      receivedConfig = actualConfig;
      receivedUri = actualUri;
      return {
        outcome: {
          findings: [finding],
          targetPath: uri.fsPath,
        },
        context: {
          resolutionIssues: [],
        },
      };
    };
    deps.now = () => 1125;
    deps.logger = {
      log: (message) => calls.push(`log:${message}`),
      error: () => undefined,
    };

    await runFileAnalysisSession({
      config,
      tree: {
        showLoading: () => calls.push('loading'),
        showResults: (findings: Finding[]) => calls.push(`results:${findings.length}`),
        showAnalysisFailure: (message: string, code?: string) =>
          calls.push(`failure:${code ?? ''}:${message}`),
      },
      diagnostics: {
        replaceForScope: (scope, findings: Finding[]) =>
          calls.push(`diagnostics:${scope.kind}:${scope.uri.fsPath}:${findings.length}`),
        replaceAll: () => calls.push('replaceAll'),
      },
      notifier: {
        info: (message: string) => infos.push(message),
        warn: () => undefined,
        error: () => undefined,
      },
      uri,
      startedAtMs: 1000,
      dependencies: deps,
    });

    assert.strictEqual(receivedConfig, config);
    assert.strictEqual(receivedUri, uri);
    assert.deepStrictEqual(calls, [
      'loading',
      'results:1',
      'diagnostics:file:/workspace/src/Foo.java:1',
      'log:File analysis finished: elapsedMs=125, file=/workspace/src/Foo.java, findings=1',
    ]);
    assert.deepStrictEqual(infos, []);
  });

  it('uses diagnostic scope from detailed file analysis context', async () => {
    const vscode = installVscodeMock();
    const folderUri = vscode.Uri.file('/workspace/src') as unknown as Uri;
    const finding = createFinding('/workspace/src/Foo.java');
    const calls: string[] = [];
    const deps = createBaseDependencies(vscode);

    deps.analyzeFileDetailed = async () => ({
      outcome: {
        findings: [finding],
        targetPath: folderUri.fsPath,
      },
      context: {
        resolutionIssues: [],
        diagnosticScope: { kind: 'folder', uri: folderUri },
      },
    });

    await runFileAnalysisSession({
      config: { getAnalysisSettings: () => ({}) } as any,
      tree: {
        showLoading: () => calls.push('loading'),
        showResults: (findings: Finding[]) => calls.push(`results:${findings.length}`),
        showAnalysisFailure: (message: string, code?: string) =>
          calls.push(`failure:${code ?? ''}:${message}`),
      },
      diagnostics: {
        replaceForScope: (scope, findings: Finding[]) =>
          calls.push(`diagnostics:${scope.kind}:${scope.uri.fsPath}:${findings.length}`),
        replaceAll: () => calls.push('replaceAll'),
      },
      notifier: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
      uri: folderUri,
      startedAtMs: 1000,
      dependencies: deps,
    });

    assert.deepStrictEqual(calls, [
      'loading',
      'results:1',
      'diagnostics:folder:/workspace/src:1',
    ]);
  });

  it('renders warning-only file outcomes as successful empty results', async () => {
    const vscode = installVscodeMock();
    const uri = vscode.Uri.file('/workspace/src/Foo.java') as unknown as Uri;
    const calls: string[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];
    const deps = createBaseDependencies(vscode);

    deps.analyzeFileDetailed = async () => ({
      outcome: {
        findings: [],
        targetPath: '/workspace/build/classes',
        warnings: [
          {
            code: 'PLUGIN_CLEANUP_FAILED',
            message: 'Could not delete plugin jar',
          },
        ],
      },
      context: {
        resolutionIssues: [],
      },
    });

    await runFileAnalysisSession({
      config: { getAnalysisSettings: () => ({}) } as any,
      tree: {
        showLoading: () => calls.push('loading'),
        showResults: (findings: Finding[]) => calls.push(`results:${findings.length}`),
        showAnalysisFailure: (message: string, code?: string) =>
          calls.push(`failure:${code ?? ''}:${message}`),
      },
      diagnostics: {
        replaceForScope: (_scope, findings: Finding[]) =>
          calls.push(`diagnostics:${findings.length}`),
        replaceAll: () => calls.push('replaceAll'),
      },
      notifier: {
        info: () => undefined,
        warn: (message: string) => warnings.push(message),
        error: (message: string) => errors.push(message),
      },
      uri,
      startedAtMs: 1000,
      dependencies: deps,
    });

    assert.deepStrictEqual(calls, ['loading', 'results:0', 'diagnostics:0']);
    assert.deepStrictEqual(warnings, [
      'SpotBugs analysis completed with cleanup warnings: [PLUGIN_CLEANUP_FAILED] Could not delete plugin jar',
    ]);
    assert.deepStrictEqual(errors, []);
  });

  it('renders file analysis failures without updating diagnostics', async () => {
    const vscode = installVscodeMock();
    const uri = vscode.Uri.file('/workspace/src/Foo.java') as unknown as Uri;
    const calls: string[] = [];
    const errors: string[] = [];
    const deps = createBaseDependencies(vscode);
    deps.now = () => 1125;
    deps.logger = {
      log: (message) => calls.push(`log:${message}`),
      error: () => undefined,
    };
    deps.analyzeFileDetailed = async () => ({
      outcome: {
        findings: [],
        targetPath: uri.fsPath,
        failure: {
          kind: 'analysis-error',
          level: 'error',
          code: 'ANALYSIS_FAILED',
          message: 'SpotBugs analysis failed: [ANALYSIS_FAILED] boom',
        },
      },
      context: {
        resolutionIssues: [],
      },
    });

    await runFileAnalysisSession({
      config: { getAnalysisSettings: () => ({}) } as any,
      tree: {
        showLoading: () => calls.push('loading'),
        showResults: (findings: Finding[]) => calls.push(`results:${findings.length}`),
        showAnalysisFailure: (message: string, code?: string) =>
          calls.push(`failure:${code ?? ''}:${message}`),
      },
      diagnostics: {
        replaceForScope: () => calls.push('diagnostics:update'),
        replaceAll: () => calls.push('replaceAll'),
      },
      notifier: {
        info: () => undefined,
        warn: () => undefined,
        error: (message: string) => errors.push(message),
      },
      uri,
      startedAtMs: 1000,
      dependencies: deps,
    });

    assert.deepStrictEqual(calls, [
      'loading',
      'failure:ANALYSIS_FAILED:SpotBugs analysis failed: [ANALYSIS_FAILED] boom',
      'log:File analysis finished: elapsedMs=125, file=/workspace/src/Foo.java, findings=0',
    ]);
    assert.deepStrictEqual(errors, [
      'SpotBugs analysis failed: [ANALYSIS_FAILED] boom',
    ]);
  });

  it('renders unexpected file analysis exceptions as failure state', async () => {
    const vscode = installVscodeMock();
    const uri = vscode.Uri.file('/workspace/src/Foo.java') as unknown as Uri;
    const calls: string[] = [];
    const errors: string[] = [];
    const loggedErrors: string[] = [];
    const deps = createBaseDependencies(vscode);
    deps.analyzeFileDetailed = async () => {
      throw new Error('transport boom');
    };
    deps.logger = {
      log: () => undefined,
      error: (message) => loggedErrors.push(message),
    };

    await runFileAnalysisSession({
      config: { getAnalysisSettings: () => ({}) } as any,
      tree: {
        showLoading: () => calls.push('loading'),
        showResults: (findings: Finding[]) => calls.push(`results:${findings.length}`),
        showAnalysisFailure: (message: string, code?: string) =>
          calls.push(`failure:${code ?? ''}:${message}`),
      },
      diagnostics: {
        replaceForScope: () => calls.push('diagnostics:update'),
        replaceAll: () => calls.push('replaceAll'),
      },
      notifier: {
        info: () => undefined,
        warn: () => undefined,
        error: (message: string) => errors.push(message),
      },
      uri,
      startedAtMs: 1000,
      dependencies: deps,
    });

    assert.deepStrictEqual(calls, [
      'loading',
      'failure:ANALYSIS_FAILED:SpotBugs analysis failed: transport boom',
    ]);
    assert.deepStrictEqual(errors, ['SpotBugs analysis failed: transport boom']);
    assert.deepStrictEqual(loggedErrors, ['An error occurred during SpotBugs analysis']);
  });
});

function createWorkspaceHarness(overrides: Partial<AnalysisSessionDependencies> = {}) {
  const vscode = installVscodeMock();
  const calls: string[] = [];
  const infos: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const progressMessages: string[] = [];
  const workspaceResults: ProjectResult[][] = [];
  const token = { isCancellationRequested: false } as any;
  const dependencies = {
    ...createBaseDependencies(vscode),
    ...overrides,
  };
  const runWithProgress: AnalysisProgressRunner = async (task) =>
    task(
      {
        report: (value: { message?: string; increment?: number }) =>
          progressMessages.push(value.message ?? ''),
      },
      token
    );

  return {
    calls,
    infos,
    warnings,
    errors,
    progressMessages,
    workspaceResults,
    token,
    dependencies,
    args: {
      config: { getAnalysisSettings: () => ({}) } as any,
      tree: {
        showAnalysisFailure: (message: string, code?: string) =>
          calls.push(`failure:${code ?? ''}:${message}`),
        showWorkspaceProgress: (projectUris: string[]) =>
          calls.push(`progress:${projectUris.length}`),
        updateProjectStatus: (
          uriString: string,
          status: string,
          extra?: { count?: number; error?: string }
        ) =>
          calls.push(
            `status:${uriString}:${status}:${extra?.count ?? ''}:${extra?.error ?? ''}`
          ),
        showWorkspaceCancelled: () => calls.push('cancelled'),
        showWorkspaceResults: (projectResults: ProjectResult[]) => {
          workspaceResults.push(projectResults);
          calls.push(`workspaceResults:${projectResults.length}`);
        },
      },
      diagnostics: {
        replaceForScope: (scope, findings: Finding[]) =>
          calls.push(`diagnostics:${scope.kind}:${scope.uri.fsPath}:${findings.length}`),
        replaceAll: (findings: Finding[]) => calls.push(`replaceAll:${findings.length}`),
      },
      notifier: {
        info: (message: string) => infos.push(message),
        warn: (message: string) => warnings.push(message),
        error: (message: string) => errors.push(message),
      },
      runWithProgress,
      dependencies,
    } satisfies RunWorkspaceAnalysisSessionArgs,
  };
}

describe('analysisRunSession workspace analysis', () => {
  it('applies all-success workspace results and replaces diagnostics once', async () => {
    const finding = createFinding('/workspace/project-a/src/Foo.java');
    const harness = createWorkspaceHarness({
      getWorkspaceProjectDiscovery: async () => ({
        projectUris: ['file:///workspace/project-a'],
        issues: [],
      }),
      analyzeWorkspaceFromProjectsDetailed: async (_config, _workspace, projectUris, notify) => {
        notify?.onStart?.(projectUris[0], 1, 1);
        notify?.onDone?.(projectUris[0], 1);
        return {
          results: [
            {
              projectUri: projectUris[0],
              findings: [finding],
            },
          ],
          context: {
            resolutionIssues: [],
          },
        };
      },
    });

    await runWorkspaceAnalysisSession(harness.args);

    assert.deepStrictEqual(harness.progressMessages, [
      'Building Java workspace...',
      '1/1 file:///workspace/project-a',
    ]);
    assert.deepStrictEqual(harness.calls, [
      'progress:1',
      'status:file:///workspace/project-a:running::',
      'status:file:///workspace/project-a:done:1:',
      'workspaceResults:1',
      'replaceAll:1',
    ]);
    assert.deepStrictEqual(harness.infos, [
      'SpotBugs: Workspace analysis completed - 1 issue found.',
    ]);
  });

  it('renders warning-only workspace results without adding tree-visible warning state', async () => {
    const projectResult: ProjectResult = {
      projectUri: 'file:///workspace/project-a',
      findings: [],
    };
    const harness = createWorkspaceHarness({
      getWorkspaceProjectDiscovery: async () => ({
        projectUris: ['file:///workspace/project-a'],
        issues: [],
      }),
      analyzeWorkspaceFromProjectsDetailed: async (_config, _workspace, projectUris, notify) => {
        notify?.onStart?.(projectUris[0], 1, 1);
        notify?.onDone?.(projectUris[0], 0);
        return {
          results: [projectResult],
          context: {
            resolutionIssues: [],
            cleanupWarnings: [
              {
                projectUri: projectUris[0],
                warning: {
                  code: 'PLUGIN_CLEANUP_FAILED',
                  message: 'Could not delete plugin jar',
                },
              },
            ],
          },
        };
      },
    });

    await runWorkspaceAnalysisSession(harness.args);

    assert.deepStrictEqual(harness.calls, [
      'progress:1',
      'status:file:///workspace/project-a:running::',
      'status:file:///workspace/project-a:done:0:',
      'workspaceResults:1',
      'replaceAll:0',
    ]);
    assert.deepStrictEqual(harness.workspaceResults, [[projectResult]]);
    assert.deepStrictEqual(harness.warnings, [
      'SpotBugs: Workspace analysis completed - No issues found. Cleanup warnings occurred in 1 project; see the SpotBugs output for details.',
    ]);
    assert.deepStrictEqual(harness.errors, []);
  });

  it('renders workspace results only after the progress callback resolves', async () => {
    const finding = createFinding('/workspace/project-a/src/Foo.java');
    const harness = createWorkspaceHarness({
      getWorkspaceProjectDiscovery: async () => ({
        projectUris: ['file:///workspace/project-a'],
        issues: [],
      }),
      analyzeWorkspaceFromProjectsDetailed: async (_config, _workspace, projectUris) => ({
        results: [
          {
            projectUri: projectUris[0],
            findings: [finding],
          },
        ],
        context: {
          resolutionIssues: [],
        },
      }),
    });
    harness.args.runWithProgress = async (task) => {
      harness.calls.push('progress:start');
      await task(
        {
          report: (value: { message?: string; increment?: number }) =>
            harness.progressMessages.push(value.message ?? ''),
        },
        harness.token
      );
      harness.calls.push('progress:end');
    };
    harness.args.notifier.info = (message: string) =>
      harness.calls.push(`info:${message}`);

    await runWorkspaceAnalysisSession(harness.args);

    assert.deepStrictEqual(harness.calls, [
      'progress:start',
      'progress:1',
      'progress:end',
      'workspaceResults:1',
      'replaceAll:1',
      'info:SpotBugs: Workspace analysis completed - 1 issue found.',
    ]);
  });

  it('passes workspace request inputs and progress token to backend analysis', async () => {
    const workspaceFolder = { uri: { fsPath: '/workspace' } } as any;
    const projectUris = ['file:///workspace/project-a'];
    let receivedConfig: unknown;
    let receivedWorkspace: unknown;
    let receivedProjectUris: unknown;
    let receivedToken: unknown;
    const harness = createWorkspaceHarness({
      getPrimaryWorkspaceFolder: () => workspaceFolder,
      getWorkspaceProjectDiscovery: async () => ({
        projectUris,
        issues: [],
      }),
      analyzeWorkspaceFromProjectsDetailed: async (
        config,
        workspace,
        backendProjectUris,
        _notify,
        token
      ) => {
        receivedConfig = config;
        receivedWorkspace = workspace;
        receivedProjectUris = backendProjectUris;
        receivedToken = token;
        return {
          results: [],
          context: {
            resolutionIssues: [],
          },
        };
      },
    });

    await runWorkspaceAnalysisSession(harness.args);

    assert.strictEqual(receivedConfig, harness.args.config);
    assert.strictEqual(receivedWorkspace, workspaceFolder.uri);
    assert.strictEqual(receivedProjectUris, projectUris);
    assert.strictEqual(receivedToken, harness.token);
  });

  it('logs and continues when workspace build returns non-zero', async () => {
    const logMessages: string[] = [];
    const harness = createWorkspaceHarness({
      buildWorkspaceAuto: async () => 1,
      logger: {
        log: (message) => logMessages.push(message),
        error: () => undefined,
      },
      getWorkspaceProjectDiscovery: async () => ({
        projectUris: ['file:///workspace/project-a'],
        issues: [],
      }),
      analyzeWorkspaceFromProjectsDetailed: async () => ({
        results: [
          {
            projectUri: 'file:///workspace/project-a',
            findings: [],
          },
        ],
        context: {
          resolutionIssues: [],
        },
      }),
    });

    await runWorkspaceAnalysisSession(harness.args);

    assert.deepStrictEqual(logMessages, [
      'Java workspace build returned non-zero (1). Proceeding with best-effort analysis...',
    ]);
    assert.deepStrictEqual(harness.calls, [
      'progress:1',
      'workspaceResults:1',
      'replaceAll:0',
    ]);
  });

  it('preserves diagnostics when all workspace projects fail', async () => {
    const harness = createWorkspaceHarness({
      getWorkspaceProjectDiscovery: async () => ({
        projectUris: ['file:///workspace/project-a', 'file:///workspace/project-b'],
        issues: [],
      }),
      analyzeWorkspaceFromProjectsDetailed: async () => ({
        results: [
          {
            projectUri: 'file:///workspace/project-a',
            findings: [],
            error: 'SpotBugs analysis failed: [ANALYSIS_FAILED] boom',
            errorCode: 'ANALYSIS_FAILED',
          },
          {
            projectUri: 'file:///workspace/project-b',
            findings: [],
            error: 'SpotBugs analysis failed: [ANALYSIS_FAILED] boom',
            errorCode: 'ANALYSIS_FAILED',
          },
        ],
        context: {
          resolutionIssues: [],
        },
      }),
    });

    await runWorkspaceAnalysisSession(harness.args);

    assert.deepStrictEqual(harness.calls, ['progress:2', 'workspaceResults:2']);
    assert.deepStrictEqual(harness.errors, [
      'SpotBugs: Workspace analysis failed - 2 projects failed. See the SpotBugs view for project errors.',
    ]);
  });

  it('preserves diagnostics when workspace projects are skipped for no class targets', async () => {
    const harness = createWorkspaceHarness({
      getWorkspaceProjectDiscovery: async () => ({
        projectUris: ['file:///workspace/project-a'],
        issues: [],
      }),
      analyzeWorkspaceFromProjectsDetailed: async () => ({
        results: [
          {
            projectUri: 'file:///workspace/project-a',
            findings: [],
            error: 'SpotBugs could not build the project. Run a manual build, then try again.',
            errorCode: 'no-class-targets',
          },
        ],
        context: {
          resolutionIssues: [],
        },
      }),
    });

    await runWorkspaceAnalysisSession(harness.args);

    assert.deepStrictEqual(harness.calls, ['progress:1', 'workspaceResults:1']);
    assert.deepStrictEqual(harness.workspaceResults, [
      [
        {
          projectUri: 'file:///workspace/project-a',
          findings: [],
          error: 'SpotBugs could not build the project. Run a manual build, then try again.',
          errorCode: 'no-class-targets',
        },
      ],
    ]);
    assert.deepStrictEqual(harness.warnings, [
      'SpotBugs could not build the project. Run a manual build, then try again.',
    ]);
  });

  it('preserves diagnostics when workspace analysis partially fails', async () => {
    const harness = createWorkspaceHarness({
      getWorkspaceProjectDiscovery: async () => ({
        projectUris: ['file:///workspace/project-a', 'file:///workspace/project-b'],
        issues: [],
      }),
      analyzeWorkspaceFromProjectsDetailed: async (_config, _workspace, projectUris, notify) => {
        notify?.onStart?.(projectUris[0], 1, 2);
        notify?.onFail?.(
          projectUris[0],
          'SpotBugs analysis failed: [ANALYSIS_FAILED] boom'
        );
        notify?.onStart?.(projectUris[1], 2, 2);
        notify?.onDone?.(projectUris[1], 0);
        return {
          results: [
            {
              projectUri: 'file:///workspace/project-a',
              findings: [],
              error: 'SpotBugs analysis failed: [ANALYSIS_FAILED] boom',
              errorCode: 'ANALYSIS_FAILED',
            },
            {
              projectUri: 'file:///workspace/project-b',
              findings: [],
            },
          ],
          context: {
            resolutionIssues: [],
          },
        };
      },
    });

    await runWorkspaceAnalysisSession(harness.args);

    assert.deepStrictEqual(harness.calls, [
      'progress:2',
      'status:file:///workspace/project-a:running::',
      'status:file:///workspace/project-a:failed::SpotBugs analysis failed: [ANALYSIS_FAILED] boom',
      'status:file:///workspace/project-b:running::',
      'status:file:///workspace/project-b:done:0:',
      'workspaceResults:2',
    ]);
    assert.deepStrictEqual(harness.warnings, [
      'SpotBugs: Workspace analysis completed with failures - 1 project failed. Successful projects produced no findings.',
    ]);
  });

  for (const scenario of [
    {
      name: 'service cancellation flag',
      tokenCancelled: false,
      result: {
        results: [],
        cancelled: true,
        context: {
          resolutionIssues: [],
        },
      },
    },
    {
      name: 'VS Code token cancellation',
      tokenCancelled: true,
      result: {
        results: [],
        cancelled: false,
        context: {
          resolutionIssues: [],
        },
      },
    },
    {
      name: 'backend cancellation envelope',
      tokenCancelled: false,
      result: {
        results: [
          {
            projectUri: 'file:///workspace/project-a',
            findings: [],
            error: 'SpotBugs analysis failed: [ANALYSIS_CANCELLED] Command cancelled',
            errorCode: 'ANALYSIS_CANCELLED',
          },
        ],
        cancelled: false,
        context: {
          resolutionIssues: [],
        },
      },
    },
  ]) {
    it(`clears workspace progress tree state on ${scenario.name}`, async () => {
      const harness = createWorkspaceHarness({
        getWorkspaceProjectDiscovery: async () => ({
          projectUris: ['file:///workspace/project-a'],
          issues: [],
        }),
        analyzeWorkspaceFromProjectsDetailed: async () => scenario.result,
      });
      harness.token.isCancellationRequested = scenario.tokenCancelled;

      await runWorkspaceAnalysisSession(harness.args);

      assert.deepStrictEqual(harness.calls, ['progress:1', 'cancelled']);
      assert.deepStrictEqual(harness.errors, []);
    });
  }

  it('renders workspace analysis exceptions as failure state', async () => {
    const loggedErrors: string[] = [];
    const harness = createWorkspaceHarness({
      logger: {
        log: () => undefined,
        error: (message) => loggedErrors.push(message),
      },
      getWorkspaceProjectDiscovery: async () => {
        throw new Error('discovery boom');
      },
    });

    await runWorkspaceAnalysisSession(harness.args);

    assert.deepStrictEqual(harness.calls, [
      'failure:WORKSPACE_ANALYSIS_FAILED:SpotBugs workspace analysis failed: discovery boom',
    ]);
    assert.deepStrictEqual(harness.errors, [
      'SpotBugs: Workspace analysis failed - discovery boom',
    ]);
    assert.deepStrictEqual(loggedErrors, [
      'An error occurred during workspace analysis',
    ]);
  });

  it('renders workspace build exceptions as failure state', async () => {
    const loggedErrors: string[] = [];
    const harness = createWorkspaceHarness({
      buildWorkspaceAuto: async () => {
        throw new Error('build boom');
      },
      logger: {
        log: () => undefined,
        error: (message) => loggedErrors.push(message),
      },
    });

    await runWorkspaceAnalysisSession(harness.args);

    assert.deepStrictEqual(harness.calls, [
      'failure:WORKSPACE_ANALYSIS_FAILED:SpotBugs workspace analysis failed: build boom',
    ]);
    assert.deepStrictEqual(harness.errors, [
      'SpotBugs: Workspace analysis failed - build boom',
    ]);
    assert.deepStrictEqual(loggedErrors, [
      'An error occurred during workspace analysis',
    ]);
  });

  it('renders workspace backend exceptions as failure state after discovery', async () => {
    const loggedErrors: string[] = [];
    const harness = createWorkspaceHarness({
      logger: {
        log: () => undefined,
        error: (message) => loggedErrors.push(message),
      },
      getWorkspaceProjectDiscovery: async () => ({
        projectUris: ['file:///workspace/project-a'],
        issues: [],
      }),
      analyzeWorkspaceFromProjectsDetailed: async () => {
        throw new Error('backend boom');
      },
    });

    await runWorkspaceAnalysisSession(harness.args);

    assert.deepStrictEqual(harness.calls, [
      'progress:1',
      'failure:WORKSPACE_ANALYSIS_FAILED:SpotBugs workspace analysis failed: backend boom',
    ]);
    assert.deepStrictEqual(harness.errors, [
      'SpotBugs: Workspace analysis failed - backend boom',
    ]);
    assert.deepStrictEqual(loggedErrors, [
      'An error occurred during workspace analysis',
    ]);
  });

  it('renders no-workspace-folder as workspace failure with the exact message', async () => {
    const loggedErrors: string[] = [];
    const harness = createWorkspaceHarness({
      getPrimaryWorkspaceFolder: () => undefined,
      logger: {
        log: () => undefined,
        error: (message) => loggedErrors.push(message),
      },
    });

    await runWorkspaceAnalysisSession(harness.args);

    assert.deepStrictEqual(harness.calls, [
      'failure:WORKSPACE_ANALYSIS_FAILED:SpotBugs workspace analysis failed: No workspace folder found.',
    ]);
    assert.deepStrictEqual(harness.errors, [
      'SpotBugs: Workspace analysis failed - No workspace folder found.',
    ]);
    assert.deepStrictEqual(loggedErrors, [
      'No workspace folder found.',
      'An error occurred during workspace analysis',
    ]);
  });
});
