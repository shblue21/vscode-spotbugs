import * as assert from 'assert';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';

installVscodeMock();

function createNoopTree() {
  return {
    showLoading: () => undefined,
    showResults: () => undefined,
    showAnalysisFailure: () => undefined,
    showWorkspaceProgress: () => undefined,
    updateProjectStatus: () => undefined,
    showWorkspaceCancelled: () => undefined,
    showWorkspaceResults: () => undefined,
  } as any;
}

function createNoopDiagnostics() {
  return {
    replaceForScope: () => undefined,
    replaceAll: () => undefined,
  } as any;
}

describe('analysisRunner', () => {
  beforeEach(() => {
    resetVscodeMock();
  });

  it('focuses the SpotBugs tree and delegates explicit file analysis', async () => {
    const originalDateNow = Date.now;
    const commandCalls: unknown[][] = [];
    const vscode = resetVscodeMock({
      commands: {
        executeCommand: async (...args: unknown[]) => {
          commandCalls.push(args);
        },
      } as any,
    });
    const session =
      require('../orchestration/analysisRunSession') as typeof import('../orchestration/analysisRunSession');
    const analysisService =
      require('../services/analysisService') as typeof import('../services/analysisService');
    const workspaceBuildService =
      require('../services/workspaceBuildService') as typeof import('../services/workspaceBuildService');
    const projectDiscovery =
      require('../workspace/projectDiscovery') as typeof import('../workspace/projectDiscovery');
    const workspaceRoots =
      require('../workspace/workspaceRoots') as typeof import('../workspace/workspaceRoots');
    const loggerModule =
      require('../core/logger') as typeof import('../core/logger');
    const originalRunFileAnalysisSession = session.runFileAnalysisSession;
    const delegated: unknown[] = [];

    session.runFileAnalysisSession = (async (args: unknown) => {
      delegated.push(args);
    }) as typeof session.runFileAnalysisSession;
    Date.now = () => 1234;

    try {
      const runner =
        require('../orchestration/analysisRunner') as typeof import('../orchestration/analysisRunner');
      const uri = vscode.Uri.file('/workspace/src/Foo.java') as any;
      const config = { getAnalysisSettings: () => ({}) } as any;
      const tree = createNoopTree();
      const diagnostics = createNoopDiagnostics();
      const notifier = {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      };

      await runner.runFileAnalysis({
        config,
        tree,
        diagnostics,
        uri,
        notifier,
      });

      assert.deepStrictEqual(commandCalls, [['spotbugs-view.focus']]);
      assert.strictEqual(delegated.length, 1);
      const args = delegated[0] as {
        config: unknown;
        tree: unknown;
        diagnostics: unknown;
        notifier: unknown;
        uri: unknown;
        startedAtMs: number;
        dependencies: {
          analyzeFileDetailed: unknown;
          analyzeWorkspaceFromProjectsDetailed: unknown;
          buildWorkspaceAuto: unknown;
          getPrimaryWorkspaceFolder: unknown;
          getWorkspaceProjectDiscovery: unknown;
          logger: unknown;
          now: () => number;
        };
      };
      assert.strictEqual(args.config, config);
      assert.strictEqual(args.tree, tree);
      assert.strictEqual(args.diagnostics, diagnostics);
      assert.strictEqual(args.notifier, notifier);
      assert.strictEqual(args.uri, uri);
      assert.strictEqual(args.startedAtMs, 1234);
      assert.strictEqual(
        args.dependencies.analyzeFileDetailed,
        analysisService.analyzeFileDetailed
      );
      assert.strictEqual(
        args.dependencies.analyzeWorkspaceFromProjectsDetailed,
        analysisService.analyzeWorkspaceFromProjectsDetailed
      );
      assert.strictEqual(
        args.dependencies.buildWorkspaceAuto,
        workspaceBuildService.buildWorkspaceAuto
      );
      assert.strictEqual(
        args.dependencies.getPrimaryWorkspaceFolder,
        workspaceRoots.getPrimaryWorkspaceFolder
      );
      assert.strictEqual(
        args.dependencies.getWorkspaceProjectDiscovery,
        projectDiscovery.getWorkspaceProjectDiscovery
      );
      assert.strictEqual(args.dependencies.logger, loggerModule.Logger);
      assert.strictEqual(args.dependencies.now(), 1234);
    } finally {
      Date.now = originalDateNow;
      session.runFileAnalysisSession = originalRunFileAnalysisSession;
    }
  });

  it('uses the default notifier for delegated file analysis when omitted', async () => {
    const vscode = installVscodeMock();
    const session =
      require('../orchestration/analysisRunSession') as typeof import('../orchestration/analysisRunSession');
    const notifierModule =
      require('../core/notifier') as typeof import('../core/notifier');
    const originalRunFileAnalysisSession = session.runFileAnalysisSession;
    const delegated: unknown[] = [];

    session.runFileAnalysisSession = (async (args: unknown) => {
      delegated.push(args);
    }) as typeof session.runFileAnalysisSession;

    try {
      const runner =
        require('../orchestration/analysisRunner') as typeof import('../orchestration/analysisRunner');

      await runner.runFileAnalysis({
        config: { getAnalysisSettings: () => ({}) } as any,
        tree: createNoopTree(),
        diagnostics: createNoopDiagnostics(),
        uri: vscode.Uri.file('/workspace/src/Foo.java') as any,
      });

      assert.strictEqual(delegated.length, 1);
      assert.strictEqual(
        (delegated[0] as { notifier: unknown }).notifier,
        notifierModule.defaultNotifier
      );
    } finally {
      session.runFileAnalysisSession = originalRunFileAnalysisSession;
    }
  });

  it('uses the active editor URI when no explicit file URI is provided', async () => {
    const vscode = installVscodeMock();
    const activeUri = vscode.Uri.file('/workspace/src/Active.java') as any;
    resetVscodeMock({
      window: {
        activeTextEditor: {
          document: {
            uri: activeUri,
          },
        },
      } as any,
    });
    const session =
      require('../orchestration/analysisRunSession') as typeof import('../orchestration/analysisRunSession');
    const originalRunFileAnalysisSession = session.runFileAnalysisSession;
    const delegated: unknown[] = [];

    session.runFileAnalysisSession = (async (args: unknown) => {
      delegated.push(args);
    }) as typeof session.runFileAnalysisSession;

    try {
      const runner =
        require('../orchestration/analysisRunner') as typeof import('../orchestration/analysisRunner');

      await runner.runFileAnalysis({
        config: { getAnalysisSettings: () => ({}) } as any,
        tree: createNoopTree(),
        diagnostics: createNoopDiagnostics(),
        notifier: {
          info: () => undefined,
          warn: () => undefined,
          error: () => undefined,
        },
      });

      assert.strictEqual(delegated.length, 1);
      assert.strictEqual((delegated[0] as { uri: unknown }).uri, activeUri);
    } finally {
      session.runFileAnalysisSession = originalRunFileAnalysisSession;
    }
  });

  it('uses the default notifier for no-active-file errors without delegating', async () => {
    const commandCalls: unknown[][] = [];
    const errors: string[] = [];
    resetVscodeMock({
      commands: {
        executeCommand: async (...args: unknown[]) => {
          commandCalls.push(args);
        },
      } as any,
      window: {
        showErrorMessage: async (message: string) => {
          errors.push(message);
          return undefined;
        },
      } as any,
    });
    const session =
      require('../orchestration/analysisRunSession') as typeof import('../orchestration/analysisRunSession');
    const originalRunFileAnalysisSession = session.runFileAnalysisSession;
    const delegated: unknown[] = [];

    session.runFileAnalysisSession = (async (args: unknown) => {
      delegated.push(args);
    }) as typeof session.runFileAnalysisSession;

    try {
      const runner =
        require('../orchestration/analysisRunner') as typeof import('../orchestration/analysisRunner');

      await runner.runFileAnalysis({
        config: { getAnalysisSettings: () => ({}) } as any,
        tree: createNoopTree(),
        diagnostics: createNoopDiagnostics(),
      });

      assert.deepStrictEqual(commandCalls, [['spotbugs-view.focus']]);
      assert.deepStrictEqual(errors, ['No Java file selected for SpotBugs analysis.']);
      assert.deepStrictEqual(delegated, []);
    } finally {
      session.runFileAnalysisSession = originalRunFileAnalysisSession;
    }
  });

  it('opens workspace progress with the current options and forwards token/progress', async () => {
    const vscode = installVscodeMock();
    const progress = { report: () => undefined };
    const token = { isCancellationRequested: true };
    const optionsSeen: unknown[] = [];
    const progressTokens: unknown[] = [];
    const commandCalls: unknown[][] = [];
    resetVscodeMock({
      commands: {
        executeCommand: async (...args: unknown[]) => {
          commandCalls.push(args);
        },
      } as any,
      window: {
        withProgress: async (options: unknown, task: Function) => {
          optionsSeen.push(options);
          return task(progress, token);
        },
      } as any,
      workspace: {
        workspaceFolders: [
          {
            name: 'workspace',
            uri: vscode.Uri.file('/workspace') as any,
          },
        ],
      } as any,
    });
    const session =
      require('../orchestration/analysisRunSession') as typeof import('../orchestration/analysisRunSession');
    const notifierModule =
      require('../core/notifier') as typeof import('../core/notifier');
    const originalRunWorkspaceAnalysisSession = session.runWorkspaceAnalysisSession;
    const delegated: unknown[] = [];

    session.runWorkspaceAnalysisSession = (async (args: unknown) => {
      delegated.push(args);
      await (args as {
        runWithProgress: (
          task: (progress: unknown, token: unknown) => Promise<void>
        ) => Promise<void>;
      }).runWithProgress(async (progressArg, tokenArg) => {
        progressTokens.push(progressArg, tokenArg);
      });
    }) as typeof session.runWorkspaceAnalysisSession;

    try {
      const runner =
        require('../orchestration/analysisRunner') as typeof import('../orchestration/analysisRunner');
      const config = { getAnalysisSettings: () => ({}) } as any;
      const tree = createNoopTree();
      const diagnostics = createNoopDiagnostics();

      await runner.runWorkspaceAnalysis({
        config,
        tree,
        diagnostics,
      });

      assert.deepStrictEqual(commandCalls, [['spotbugs-view.focus']]);
      assert.deepStrictEqual(optionsSeen, [
        {
          location: vscode.ProgressLocation.Notification,
          title: 'SpotBugs: Analyzing workspace',
          cancellable: true,
        },
      ]);
      assert.strictEqual(delegated.length, 1);
      const delegatedArgs = delegated[0] as {
        config: unknown;
        tree: unknown;
        diagnostics: unknown;
        notifier: unknown;
      };
      assert.strictEqual(delegatedArgs.config, config);
      assert.strictEqual(delegatedArgs.tree, tree);
      assert.strictEqual(delegatedArgs.diagnostics, diagnostics);
      assert.strictEqual(delegatedArgs.notifier, notifierModule.defaultNotifier);
      assert.deepStrictEqual(progressTokens, [progress, token]);
    } finally {
      session.runWorkspaceAnalysisSession = originalRunWorkspaceAnalysisSession;
    }
  });
});
