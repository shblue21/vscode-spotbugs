import * as assert from 'assert';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';

installVscodeMock();

describe('analysisRunner', () => {
  beforeEach(() => {
    resetVscodeMock();
  });

  it('renders file analysis failures without showing empty successful results', async () => {
    const vscode = installVscodeMock();
    const analysisService =
      require('../services/analysisService') as typeof import('../services/analysisService');
    const originalAnalyzeFileDetailed = analysisService.analyzeFileDetailed;
    analysisService.analyzeFileDetailed = (async () => ({
      outcome: {
        findings: [],
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
    })) as typeof analysisService.analyzeFileDetailed;

    try {
      const runner =
        require('../orchestration/analysisRunner') as typeof import('../orchestration/analysisRunner');
      const calls: string[] = [];
      const errors: string[] = [];

      await runner.runFileAnalysis({
        config: { getAnalysisSettings: () => ({}) } as any,
        tree: {
          showLoading: () => calls.push('loading'),
          showResults: (findings: unknown[]) => calls.push(`results:${findings.length}`),
          showAnalysisFailure: (message: string, code?: string) =>
            calls.push(`failure:${code ?? ''}:${message}`),
        } as any,
        diagnostics: {
          updateForFile: () => calls.push('diagnostics:update'),
        } as any,
        uri: vscode.Uri.file('/workspace/src/Foo.java') as any,
        notifier: {
          info: () => undefined,
          warn: () => undefined,
          error: (message: string) => errors.push(message),
        },
      });

      assert.deepStrictEqual(calls, [
        'loading',
        'failure:ANALYSIS_FAILED:SpotBugs analysis failed: [ANALYSIS_FAILED] boom',
      ]);
      assert.deepStrictEqual(errors, [
        'SpotBugs analysis failed: [ANALYSIS_FAILED] boom',
      ]);
    } finally {
      analysisService.analyzeFileDetailed = originalAnalyzeFileDetailed;
    }
  });

  it('renders unexpected file analysis exceptions as failure state without clearing diagnostics', async () => {
    const vscode = installVscodeMock();
    const analysisService =
      require('../services/analysisService') as typeof import('../services/analysisService');
    const originalAnalyzeFileDetailed = analysisService.analyzeFileDetailed;
    analysisService.analyzeFileDetailed = (async () => {
      throw new Error('transport boom');
    }) as typeof analysisService.analyzeFileDetailed;

    try {
      const runner =
        require('../orchestration/analysisRunner') as typeof import('../orchestration/analysisRunner');
      const calls: string[] = [];
      const errors: string[] = [];

      await runner.runFileAnalysis({
        config: { getAnalysisSettings: () => ({}) } as any,
        tree: {
          showLoading: () => calls.push('loading'),
          showResults: (findings: unknown[]) => calls.push(`results:${findings.length}`),
          showAnalysisFailure: (message: string, code?: string) =>
            calls.push(`failure:${code ?? ''}:${message}`),
        } as any,
        diagnostics: {
          updateForFile: () => calls.push('diagnostics:update'),
        } as any,
        uri: vscode.Uri.file('/workspace/src/Foo.java') as any,
        notifier: {
          info: () => undefined,
          warn: () => undefined,
          error: (message: string) => errors.push(message),
        },
      });

      assert.deepStrictEqual(calls, [
        'loading',
        'failure:ANALYSIS_FAILED:SpotBugs analysis failed: transport boom',
      ]);
      assert.deepStrictEqual(errors, [
        'SpotBugs analysis failed: transport boom',
      ]);
    } finally {
      analysisService.analyzeFileDetailed = originalAnalyzeFileDetailed;
    }
  });

  it('renders all-failed workspace analysis without clearing diagnostics as empty success', async () => {
    const vscode = installVscodeMock();
    resetVscodeMock({
      workspace: {
        workspaceFolders: [
          {
            name: 'workspace',
            uri: vscode.Uri.file('/workspace') as any,
          },
        ],
      } as any,
    });
    const workspaceBuildService =
      require('../services/workspaceBuildService') as typeof import('../services/workspaceBuildService');
    const projectDiscovery =
      require('../workspace/projectDiscovery') as typeof import('../workspace/projectDiscovery');
    const analysisService =
      require('../services/analysisService') as typeof import('../services/analysisService');
    const originalBuildWorkspaceAuto = workspaceBuildService.buildWorkspaceAuto;
    const originalGetWorkspaceProjectDiscovery = projectDiscovery.getWorkspaceProjectDiscovery;
    const originalAnalyzeWorkspaceFromProjectsDetailed =
      analysisService.analyzeWorkspaceFromProjectsDetailed;

    workspaceBuildService.buildWorkspaceAuto = (async () => 0) as typeof workspaceBuildService.buildWorkspaceAuto;
    projectDiscovery.getWorkspaceProjectDiscovery = (async () => ({
      projectUris: ['file:///workspace/project-a', 'file:///workspace/project-b'],
      issues: [],
    })) as typeof projectDiscovery.getWorkspaceProjectDiscovery;
    analysisService.analyzeWorkspaceFromProjectsDetailed = (async () => ({
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
    })) as typeof analysisService.analyzeWorkspaceFromProjectsDetailed;

    try {
      const runner =
        require('../orchestration/analysisRunner') as typeof import('../orchestration/analysisRunner');
      const calls: string[] = [];
      const errors: string[] = [];

      await runner.runWorkspaceAnalysis({
        config: { getAnalysisSettings: () => ({}) } as any,
        tree: {
          showWorkspaceProgress: (projectUris: string[]) =>
            calls.push(`progress:${projectUris.length}`),
          updateProjectStatus: () => undefined,
          showResults: (findings: unknown[]) => calls.push(`results:${findings.length}`),
          showWorkspaceResults: (projectResults: unknown[]) =>
            calls.push(`workspaceResults:${projectResults.length}`),
        } as any,
        diagnostics: {
          replaceAll: (findings: unknown[]) => calls.push(`diagnostics:${findings.length}`),
        } as any,
        notifier: {
          info: () => undefined,
          warn: () => undefined,
          error: (message: string) => errors.push(message),
        },
      });

      assert.deepStrictEqual(calls, ['progress:2', 'workspaceResults:2']);
      assert.deepStrictEqual(errors, [
        'SpotBugs: Workspace analysis failed - 2 projects failed. See the SpotBugs view for project errors.',
      ]);
    } finally {
      workspaceBuildService.buildWorkspaceAuto = originalBuildWorkspaceAuto;
      projectDiscovery.getWorkspaceProjectDiscovery = originalGetWorkspaceProjectDiscovery;
      analysisService.analyzeWorkspaceFromProjectsDetailed =
        originalAnalyzeWorkspaceFromProjectsDetailed;
    }
  });

  it('leaves diagnostics untouched when workspace analysis partially fails', async () => {
    const vscode = installVscodeMock();
    resetVscodeMock({
      workspace: {
        workspaceFolders: [
          {
            name: 'workspace',
            uri: vscode.Uri.file('/workspace') as any,
          },
        ],
      } as any,
    });
    const workspaceBuildService =
      require('../services/workspaceBuildService') as typeof import('../services/workspaceBuildService');
    const projectDiscovery =
      require('../workspace/projectDiscovery') as typeof import('../workspace/projectDiscovery');
    const analysisService =
      require('../services/analysisService') as typeof import('../services/analysisService');
    const originalBuildWorkspaceAuto = workspaceBuildService.buildWorkspaceAuto;
    const originalGetWorkspaceProjectDiscovery = projectDiscovery.getWorkspaceProjectDiscovery;
    const originalAnalyzeWorkspaceFromProjectsDetailed =
      analysisService.analyzeWorkspaceFromProjectsDetailed;

    workspaceBuildService.buildWorkspaceAuto = (async () => 0) as typeof workspaceBuildService.buildWorkspaceAuto;
    projectDiscovery.getWorkspaceProjectDiscovery = (async () => ({
      projectUris: ['file:///workspace/project-a', 'file:///workspace/project-b'],
      issues: [],
    })) as typeof projectDiscovery.getWorkspaceProjectDiscovery;
    analysisService.analyzeWorkspaceFromProjectsDetailed = (async () => ({
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
    })) as typeof analysisService.analyzeWorkspaceFromProjectsDetailed;

    try {
      const runner =
        require('../orchestration/analysisRunner') as typeof import('../orchestration/analysisRunner');
      const calls: string[] = [];

      await runner.runWorkspaceAnalysis({
        config: { getAnalysisSettings: () => ({}) } as any,
        tree: {
          showWorkspaceProgress: (projectUris: string[]) =>
            calls.push(`progress:${projectUris.length}`),
          updateProjectStatus: () => undefined,
          showWorkspaceResults: (projectResults: unknown[]) =>
            calls.push(`workspaceResults:${projectResults.length}`),
        } as any,
        diagnostics: {
          replaceAll: (findings: unknown[]) => calls.push(`replaceAll:${findings.length}`),
        } as any,
        notifier: {
          info: () => undefined,
          warn: () => undefined,
          error: () => undefined,
        },
      });

      assert.deepStrictEqual(calls, [
        'progress:2',
        'workspaceResults:2',
      ]);
    } finally {
      workspaceBuildService.buildWorkspaceAuto = originalBuildWorkspaceAuto;
      projectDiscovery.getWorkspaceProjectDiscovery = originalGetWorkspaceProjectDiscovery;
      analysisService.analyzeWorkspaceFromProjectsDetailed =
        originalAnalyzeWorkspaceFromProjectsDetailed;
    }
  });

  it('clears workspace progress tree state on cancellation without touching diagnostics', async () => {
    const vscode = installVscodeMock();
    resetVscodeMock({
      workspace: {
        workspaceFolders: [
          {
            name: 'workspace',
            uri: vscode.Uri.file('/workspace') as any,
          },
        ],
      } as any,
    });
    const workspaceBuildService =
      require('../services/workspaceBuildService') as typeof import('../services/workspaceBuildService');
    const projectDiscovery =
      require('../workspace/projectDiscovery') as typeof import('../workspace/projectDiscovery');
    const analysisService =
      require('../services/analysisService') as typeof import('../services/analysisService');
    const originalBuildWorkspaceAuto = workspaceBuildService.buildWorkspaceAuto;
    const originalGetWorkspaceProjectDiscovery = projectDiscovery.getWorkspaceProjectDiscovery;
    const originalAnalyzeWorkspaceFromProjectsDetailed =
      analysisService.analyzeWorkspaceFromProjectsDetailed;

    workspaceBuildService.buildWorkspaceAuto = (async () => 0) as typeof workspaceBuildService.buildWorkspaceAuto;
    projectDiscovery.getWorkspaceProjectDiscovery = (async () => ({
      projectUris: ['file:///workspace/project-a'],
      issues: [],
    })) as typeof projectDiscovery.getWorkspaceProjectDiscovery;
    analysisService.analyzeWorkspaceFromProjectsDetailed = (async () => ({
      results: [],
      cancelled: true,
      context: {
        resolutionIssues: [],
      },
    })) as typeof analysisService.analyzeWorkspaceFromProjectsDetailed;

    try {
      const runner =
        require('../orchestration/analysisRunner') as typeof import('../orchestration/analysisRunner');
      const calls: string[] = [];

      await runner.runWorkspaceAnalysis({
        config: { getAnalysisSettings: () => ({}) } as any,
        tree: {
          showWorkspaceProgress: (projectUris: string[]) =>
            calls.push(`progress:${projectUris.length}`),
          updateProjectStatus: () => undefined,
          showWorkspaceCancelled: () => calls.push('cancelled'),
          showWorkspaceResults: (projectResults: unknown[]) =>
            calls.push(`workspaceResults:${projectResults.length}`),
        } as any,
        diagnostics: {
          replaceAll: (findings: unknown[]) => calls.push(`diagnostics:${findings.length}`),
        } as any,
        notifier: {
          info: () => undefined,
          warn: () => undefined,
          error: () => undefined,
        },
      });

      assert.deepStrictEqual(calls, ['progress:1', 'cancelled']);
    } finally {
      workspaceBuildService.buildWorkspaceAuto = originalBuildWorkspaceAuto;
      projectDiscovery.getWorkspaceProjectDiscovery = originalGetWorkspaceProjectDiscovery;
      analysisService.analyzeWorkspaceFromProjectsDetailed =
        originalAnalyzeWorkspaceFromProjectsDetailed;
    }
  });

  it('clears workspace progress tree state on VS Code token cancellation', async () => {
    const vscode = installVscodeMock();
    resetVscodeMock({
      workspace: {
        workspaceFolders: [
          {
            name: 'workspace',
            uri: vscode.Uri.file('/workspace') as any,
          },
        ],
      } as any,
      window: {
        withProgress: async (
          _options: unknown,
          task: (
            progress: { report: () => void },
            token: { isCancellationRequested: boolean }
          ) => Promise<unknown>
        ) =>
          task(
            {
              report: () => undefined,
            },
            {
              isCancellationRequested: true,
            }
          ),
      } as any,
    });
    const workspaceBuildService =
      require('../services/workspaceBuildService') as typeof import('../services/workspaceBuildService');
    const projectDiscovery =
      require('../workspace/projectDiscovery') as typeof import('../workspace/projectDiscovery');
    const analysisService =
      require('../services/analysisService') as typeof import('../services/analysisService');
    const originalBuildWorkspaceAuto = workspaceBuildService.buildWorkspaceAuto;
    const originalGetWorkspaceProjectDiscovery = projectDiscovery.getWorkspaceProjectDiscovery;
    const originalAnalyzeWorkspaceFromProjectsDetailed =
      analysisService.analyzeWorkspaceFromProjectsDetailed;

    workspaceBuildService.buildWorkspaceAuto = (async () => 0) as typeof workspaceBuildService.buildWorkspaceAuto;
    projectDiscovery.getWorkspaceProjectDiscovery = (async () => ({
      projectUris: ['file:///workspace/project-a'],
      issues: [],
    })) as typeof projectDiscovery.getWorkspaceProjectDiscovery;
    analysisService.analyzeWorkspaceFromProjectsDetailed = (async () => ({
      results: [],
      cancelled: false,
      context: {
        resolutionIssues: [],
      },
    })) as typeof analysisService.analyzeWorkspaceFromProjectsDetailed;

    try {
      const runner =
        require('../orchestration/analysisRunner') as typeof import('../orchestration/analysisRunner');
      const calls: string[] = [];

      await runner.runWorkspaceAnalysis({
        config: { getAnalysisSettings: () => ({}) } as any,
        tree: {
          showWorkspaceProgress: (projectUris: string[]) =>
            calls.push(`progress:${projectUris.length}`),
          updateProjectStatus: () => undefined,
          showWorkspaceCancelled: () => calls.push('cancelled'),
          showWorkspaceResults: (projectResults: unknown[]) =>
            calls.push(`workspaceResults:${projectResults.length}`),
        } as any,
        diagnostics: {
          replaceAll: (findings: unknown[]) => calls.push(`diagnostics:${findings.length}`),
        } as any,
        notifier: {
          info: () => undefined,
          warn: () => undefined,
          error: () => undefined,
        },
      });

      assert.deepStrictEqual(calls, ['progress:1', 'cancelled']);
    } finally {
      workspaceBuildService.buildWorkspaceAuto = originalBuildWorkspaceAuto;
      projectDiscovery.getWorkspaceProjectDiscovery = originalGetWorkspaceProjectDiscovery;
      analysisService.analyzeWorkspaceFromProjectsDetailed =
        originalAnalyzeWorkspaceFromProjectsDetailed;
    }
  });

  it('clears workspace progress tree state on backend cancellation envelopes', async () => {
    const vscode = installVscodeMock();
    resetVscodeMock({
      workspace: {
        workspaceFolders: [
          {
            name: 'workspace',
            uri: vscode.Uri.file('/workspace') as any,
          },
        ],
      } as any,
    });
    const workspaceBuildService =
      require('../services/workspaceBuildService') as typeof import('../services/workspaceBuildService');
    const projectDiscovery =
      require('../workspace/projectDiscovery') as typeof import('../workspace/projectDiscovery');
    const analysisService =
      require('../services/analysisService') as typeof import('../services/analysisService');
    const originalBuildWorkspaceAuto = workspaceBuildService.buildWorkspaceAuto;
    const originalGetWorkspaceProjectDiscovery = projectDiscovery.getWorkspaceProjectDiscovery;
    const originalAnalyzeWorkspaceFromProjectsDetailed =
      analysisService.analyzeWorkspaceFromProjectsDetailed;

    workspaceBuildService.buildWorkspaceAuto = (async () => 0) as typeof workspaceBuildService.buildWorkspaceAuto;
    projectDiscovery.getWorkspaceProjectDiscovery = (async () => ({
      projectUris: ['file:///workspace/project-a'],
      issues: [],
    })) as typeof projectDiscovery.getWorkspaceProjectDiscovery;
    analysisService.analyzeWorkspaceFromProjectsDetailed = (async () => ({
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
    })) as typeof analysisService.analyzeWorkspaceFromProjectsDetailed;

    try {
      const runner =
        require('../orchestration/analysisRunner') as typeof import('../orchestration/analysisRunner');
      const calls: string[] = [];
      const errors: string[] = [];

      await runner.runWorkspaceAnalysis({
        config: { getAnalysisSettings: () => ({}) } as any,
        tree: {
          showWorkspaceProgress: (projectUris: string[]) =>
            calls.push(`progress:${projectUris.length}`),
          updateProjectStatus: () => undefined,
          showWorkspaceCancelled: () => calls.push('cancelled'),
          showWorkspaceResults: (projectResults: unknown[]) =>
            calls.push(`workspaceResults:${projectResults.length}`),
        } as any,
        diagnostics: {
          replaceAll: (findings: unknown[]) => calls.push(`diagnostics:${findings.length}`),
        } as any,
        notifier: {
          info: () => undefined,
          warn: () => undefined,
          error: (message: string) => errors.push(message),
        },
      });

      assert.deepStrictEqual(calls, ['progress:1', 'cancelled']);
      assert.deepStrictEqual(errors, []);
    } finally {
      workspaceBuildService.buildWorkspaceAuto = originalBuildWorkspaceAuto;
      projectDiscovery.getWorkspaceProjectDiscovery = originalGetWorkspaceProjectDiscovery;
      analysisService.analyzeWorkspaceFromProjectsDetailed =
        originalAnalyzeWorkspaceFromProjectsDetailed;
    }
  });

  it('renders workspace analysis exceptions as failure state without touching diagnostics', async () => {
    const vscode = installVscodeMock();
    resetVscodeMock({
      workspace: {
        workspaceFolders: [
          {
            name: 'workspace',
            uri: vscode.Uri.file('/workspace') as any,
          },
        ],
      } as any,
    });
    const workspaceBuildService =
      require('../services/workspaceBuildService') as typeof import('../services/workspaceBuildService');
    const projectDiscovery =
      require('../workspace/projectDiscovery') as typeof import('../workspace/projectDiscovery');
    const originalBuildWorkspaceAuto = workspaceBuildService.buildWorkspaceAuto;
    const originalGetWorkspaceProjectDiscovery = projectDiscovery.getWorkspaceProjectDiscovery;

    workspaceBuildService.buildWorkspaceAuto = (async () => 0) as typeof workspaceBuildService.buildWorkspaceAuto;
    projectDiscovery.getWorkspaceProjectDiscovery = (async () => {
      throw new Error('discovery boom');
    }) as typeof projectDiscovery.getWorkspaceProjectDiscovery;

    try {
      const runner =
        require('../orchestration/analysisRunner') as typeof import('../orchestration/analysisRunner');
      const calls: string[] = [];
      const errors: string[] = [];

      await runner.runWorkspaceAnalysis({
        config: { getAnalysisSettings: () => ({}) } as any,
        tree: {
          showAnalysisFailure: (message: string, code?: string) =>
            calls.push(`failure:${code ?? ''}:${message}`),
          showWorkspaceResults: (projectResults: unknown[]) =>
            calls.push(`workspaceResults:${projectResults.length}`),
        } as any,
        diagnostics: {
          replaceAll: (findings: unknown[]) => calls.push(`diagnostics:${findings.length}`),
        } as any,
        notifier: {
          info: () => undefined,
          warn: () => undefined,
          error: (message: string) => errors.push(message),
        },
      });

      assert.deepStrictEqual(calls, [
        'failure:WORKSPACE_ANALYSIS_FAILED:SpotBugs workspace analysis failed: discovery boom',
      ]);
      assert.deepStrictEqual(errors, [
        'SpotBugs: Workspace analysis failed - discovery boom',
      ]);
    } finally {
      workspaceBuildService.buildWorkspaceAuto = originalBuildWorkspaceAuto;
      projectDiscovery.getWorkspaceProjectDiscovery = originalGetWorkspaceProjectDiscovery;
    }
  });

});
