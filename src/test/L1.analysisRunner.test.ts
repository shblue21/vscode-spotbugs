import * as assert from 'assert';
import { AnalysisRunCoordinator } from '../orchestration/analysisRunCoordinator';
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

function captureFileAnalysisSessions(): {
  delegated: unknown[];
  restore: () => void;
} {
  const session =
    require('../orchestration/analysisRunSession') as typeof import('../orchestration/analysisRunSession');
  const original = session.runFileAnalysisSession;
  const delegated: unknown[] = [];
  session.runFileAnalysisSession = (async (args: unknown) => {
    delegated.push(args);
  }) as typeof session.runFileAnalysisSession;
  return {
    delegated,
    restore: () => {
      session.runFileAnalysisSession = original;
    },
  };
}

describe('analysisRunner', () => {
  beforeEach(() => {
    resetVscodeMock();
  });

  for (const pendingStage of ['lookup', 'picker'] as const) {
    it(`does not let a delayed project ${pendingStage} supersede a newer source run`, async () => {
      const discovery =
        require('../workspace/projectDiscovery') as typeof import('../workspace/projectDiscovery');
      const originalLookup = discovery.getProjectRootPaths;
      let release!: (value: any) => void;
      let entered!: () => void;
      const ready = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const pending = new Promise<any>((resolve) => {
        release = resolve;
      });
      const vscode = resetVscodeMock({
        window: {
          showQuickPick: (async () => {
            entered();
            return pending;
          }) as any,
        } as any,
      });
      discovery.getProjectRootPaths = async () => {
        if (pendingStage === 'lookup') {
          entered();
          return pending;
        }
        return ['/project'];
      };
      const { delegated, restore } = captureFileAnalysisSessions();
      const coordinator = new AnalysisRunCoordinator();
      const command = require('../commands/analysis') as typeof import('../commands/analysis');
      const config = { getAnalysisSettings: () => ({}) } as any;
      try {
        const project = command.checkCode(
          config,
          createNoopTree(),
          createNoopDiagnostics(),
          vscode.Uri.file(pendingStage === 'lookup' ? '/project/A.java' : '/outside/A.java') as any,
          coordinator,
          'project',
        );
        await ready;
        await command.checkCode(
          config,
          createNoopTree(),
          createNoopDiagnostics(),
          vscode.Uri.file('/project/B.java') as any,
          coordinator,
          'source',
        );
        const newer = delegated[0] as { lease: { isCurrent(): boolean }; analysisKind: string };
        release(pendingStage === 'lookup' ? ['/project'] : { uri: vscode.Uri.file('/project') });
        await project;
        assert.strictEqual(delegated.length, 1);
        assert.strictEqual(newer.analysisKind, 'source');
        assert.strictEqual(newer.lease.isCurrent(), true);
      } finally {
        release(undefined);
        discovery.getProjectRootPaths = originalLookup;
        restore();
        coordinator.dispose();
      }
    });
  }

  for (const superseded of [false, true]) {
    it(`dismisses the project picker ${superseded ? 'without changing a newer analysis' : 'and clears the cancelled analysis loading state'}`, async () => {
      const discovery =
        require('../workspace/projectDiscovery') as typeof import('../workspace/projectDiscovery');
      const service =
        require('../services/analysisService') as typeof import('../services/analysisService');
      const command = require('../commands/analysis') as typeof import('../commands/analysis');
      const originalLookup = discovery.getProjectRootPaths;
      const originalAnalyze = service.analyzeFileDetailed;
      let dismiss!: () => void;
      let pickerEntered!: () => void;
      const pickerReady = new Promise<void>((resolve) => { pickerEntered = resolve; });
      const picker = new Promise<undefined>((resolve) => { dismiss = () => resolve(undefined); });
      let finishAnalysis!: (result: any) => void;
      const analysis = new Promise<any>((resolve) => { finishAnalysis = resolve; });
      const vscode = resetVscodeMock({
        window: { showQuickPick: async () => { pickerEntered(); return picker; } } as any,
      });
      discovery.getProjectRootPaths = async () => ['/project'];
      service.analyzeFileDetailed = async () => analysis;
      const coordinator = new AnalysisRunCoordinator();
      let state = 'initial';
      const tree = {
        ...createNoopTree(),
        showLoading: () => { state = 'loading'; },
        showAnalysisFailure: (_message: string, code: string) => { state = code; },
      };
      const run = (kind: 'source' | 'project') => command.checkCode(
        {} as any, tree, createNoopDiagnostics(),
        vscode.Uri.file('/outside/A.java') as any, coordinator, kind,
      );
      let oldRun: Promise<void> | undefined;
      let projectRun: Promise<void> | undefined;
      let newRun: Promise<void> | undefined;
      try {
        oldRun = run('source');
        // The runner awaits tree focus before entering the analysis session.
        await new Promise<void>((resolve) => setImmediate(resolve));
        assert.strictEqual(state, 'loading');
        projectRun = run('project');
        await pickerReady;
        if (superseded) {
          newRun = run('source');
          await new Promise<void>((resolve) => setImmediate(resolve));
        }
        dismiss();
        await projectRun;
        assert.strictEqual(state, superseded ? 'loading' : 'ANALYSIS_CANCELLED');
        finishAnalysis({
          context: {},
          outcome: { findings: [], failure: { message: 'Finished', code: 'TEST_FINISHED' } },
        });
        await oldRun;
        await newRun;
        assert.strictEqual(state, superseded ? 'TEST_FINISHED' : 'ANALYSIS_CANCELLED');
      } finally {
        coordinator.dispose();
        dismiss();
        finishAnalysis({ outcome: {} });
        await Promise.allSettled([oldRun, projectRun, newRun]);
        discovery.getProjectRootPaths = originalLookup;
        service.analyzeFileDetailed = originalAnalyze;
      }
    });
  }

  it('reuses the project lease and cancellation token from lookup through execution', async () => {
    const discovery =
      require('../workspace/projectDiscovery') as typeof import('../workspace/projectDiscovery');
    const originalLookup = discovery.getProjectRootPaths;
    const vscode = resetVscodeMock();
    const token = { isCancellationRequested: false } as any;
    const lease = { token, isCurrent: () => true, cancel: () => undefined };
    let beginCount = 0;
    const coordinator = {
      begin: () => {
        beginCount++;
        return lease;
      },
    } as any;
    discovery.getProjectRootPaths = async (options) => {
      assert.strictEqual(beginCount, 1);
      assert.strictEqual(options?.token, token);
      return ['/project'];
    };
    const { delegated, restore } = captureFileAnalysisSessions();
    try {
      const command = require('../commands/analysis') as typeof import('../commands/analysis');
      await command.checkCode(
        { getAnalysisSettings: () => ({}) } as any,
        createNoopTree(),
        createNoopDiagnostics(),
        vscode.Uri.file('/project/A.java') as any,
        coordinator,
        'project',
      );
      assert.strictEqual(beginCount, 1);
      assert.strictEqual((delegated[0] as any).lease, lease);
    } finally {
      discovery.getProjectRootPaths = originalLookup;
      restore();
    }
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
    const analysisService =
      require('../services/analysisService') as typeof import('../services/analysisService');
    const workspaceBuildService =
      require('../services/workspaceBuildService') as typeof import('../services/workspaceBuildService');
    const projectDiscovery =
      require('../workspace/projectDiscovery') as typeof import('../workspace/projectDiscovery');
    const workspaceRoots =
      require('../workspace/workspaceRoots') as typeof import('../workspace/workspaceRoots');
    const loggerModule = require('../core/logger') as typeof import('../core/logger');
    const { delegated, restore } = captureFileAnalysisSessions();
    Date.now = () => 1234;

    try {
      const runner =
        require('../orchestration/analysisRunner') as typeof import('../orchestration/analysisRunner');
      const uri = vscode.Uri.file('/workspace/src/Foo.java') as any;
      const config = { getAnalysisSettings: () => ({}) } as any;
      const tree = createNoopTree();
      const diagnostics = createNoopDiagnostics();
      const coordinator = {
        begin: () => {
          commandCalls.push(['coordinator.begin']);
          return { isCurrent: () => true };
        },
      } as AnalysisRunCoordinator;
      const notifier = {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      };

      await runner.runFileAnalysis({
        config,
        tree,
        diagnostics,
        coordinator,
        uri,
        notifier,
      });

      assert.deepStrictEqual(commandCalls, [['coordinator.begin'], ['spotbugs-view.focus']]);
      assert.strictEqual(delegated.length, 1);
      const args = delegated[0] as import('../orchestration/analysisRunSession').RunFileAnalysisSessionArgs;
      assert.strictEqual(args.config, config);
      assert.strictEqual(args.tree, tree);
      assert.strictEqual(args.diagnostics, diagnostics);
      assert.strictEqual(args.notifier, notifier);
      assert.strictEqual(args.uri, uri);
      assert.strictEqual(args.startedAtMs, 1234);
      assert.strictEqual(
        args.dependencies.analyzeFileDetailed,
        analysisService.analyzeFileDetailed,
      );
      assert.strictEqual(
        args.dependencies.analyzeWorkspaceFromProjectsDetailed,
        analysisService.analyzeWorkspaceFromProjectsDetailed,
      );
      assert.strictEqual(
        args.dependencies.buildWorkspaceAuto,
        workspaceBuildService.buildWorkspaceAuto,
      );
      assert.strictEqual(
        args.dependencies.getPrimaryWorkspaceFolder,
        workspaceRoots.getPrimaryWorkspaceFolder,
      );
      assert.strictEqual(
        args.dependencies.getWorkspaceProjectDiscovery,
        projectDiscovery.getWorkspaceProjectDiscovery,
      );
      assert.strictEqual(args.dependencies.logger, loggerModule.Logger);
      assert.strictEqual(args.dependencies.now(), 1234);
    } finally {
      Date.now = originalDateNow;
      restore();
    }
  });

  it('uses the default notifier for delegated file analysis when omitted', async () => {
    const vscode = installVscodeMock();
    const notifierModule = require('../core/notifier') as typeof import('../core/notifier');
    const { delegated, restore } = captureFileAnalysisSessions();

    try {
      const runner =
        require('../orchestration/analysisRunner') as typeof import('../orchestration/analysisRunner');

      await runner.runFileAnalysis({
        config: { getAnalysisSettings: () => ({}) } as any,
        tree: createNoopTree(),
        diagnostics: createNoopDiagnostics(),
        coordinator: new AnalysisRunCoordinator(),
        uri: vscode.Uri.file('/workspace/src/Foo.java') as any,
      });

      assert.strictEqual(delegated.length, 1);
      assert.strictEqual(
        (delegated[0] as { notifier: unknown }).notifier,
        notifierModule.defaultNotifier,
      );
    } finally {
      restore();
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
    const { delegated, restore } = captureFileAnalysisSessions();

    try {
      const runner =
        require('../orchestration/analysisRunner') as typeof import('../orchestration/analysisRunner');

      await runner.runFileAnalysis({
        config: { getAnalysisSettings: () => ({}) } as any,
        tree: createNoopTree(),
        diagnostics: createNoopDiagnostics(),
        coordinator: new AnalysisRunCoordinator(),
        notifier: {
          info: () => undefined,
          warn: () => undefined,
          error: () => undefined,
        },
      });

      assert.strictEqual(delegated.length, 1);
      assert.strictEqual((delegated[0] as { uri: unknown }).uri, activeUri);
    } finally {
      restore();
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
    const { delegated, restore } = captureFileAnalysisSessions();

    try {
      const runner =
        require('../orchestration/analysisRunner') as typeof import('../orchestration/analysisRunner');

      await runner.runFileAnalysis({
        config: { getAnalysisSettings: () => ({}) } as any,
        tree: createNoopTree(),
        diagnostics: createNoopDiagnostics(),
        coordinator: new AnalysisRunCoordinator(),
      });

      assert.deepStrictEqual(commandCalls, [['spotbugs-view.focus']]);
      assert.deepStrictEqual(errors, ['No Java file selected for SpotBugs analysis.']);
      assert.deepStrictEqual(delegated, []);
    } finally {
      restore();
    }
  });

  it('opens workspace progress with the current options and forwards token/progress', async () => {
    const vscode = installVscodeMock();
    const progress = { report: () => undefined };
    let cancellationRegistrationDisposed = false;
    let cancelProgress: () => void = () => undefined;
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: (listener: () => void) => {
        cancelProgress = listener;
        return {
          dispose: () => {
            cancellationRegistrationDisposed = true;
          },
        };
      },
    };
    const leaseToken = { isCancellationRequested: false } as any;
    let leaseCancelCalls = 0;
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
    const notifierModule = require('../core/notifier') as typeof import('../core/notifier');
    const originalRunWorkspaceAnalysisSession = session.runWorkspaceAnalysisSession;
    const delegated: unknown[] = [];

    session.runWorkspaceAnalysisSession = (async (args: unknown) => {
      delegated.push(args);
      await (
        args as {
          runWithProgress: (
            task: (progress: unknown, token: unknown) => Promise<void>,
          ) => Promise<void>;
        }
      ).runWithProgress(async (progressArg, tokenArg) => {
        progressTokens.push(progressArg, tokenArg);
        cancelProgress();
      });
    }) as typeof session.runWorkspaceAnalysisSession;

    try {
      const runner =
        require('../orchestration/analysisRunner') as typeof import('../orchestration/analysisRunner');
      const config = { getAnalysisSettings: () => ({}) } as any;
      const tree = createNoopTree();
      const diagnostics = createNoopDiagnostics();
      const coordinator = new AnalysisRunCoordinator(() => ({
        token: leaseToken,
        cancel: () => {
          leaseCancelCalls += 1;
          leaseToken.isCancellationRequested = true;
        },
        dispose: () => undefined,
      }));

      await runner.runWorkspaceAnalysis({
        config,
        tree,
        diagnostics,
        coordinator,
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
      assert.deepStrictEqual(progressTokens, [progress, leaseToken]);
      assert.strictEqual(leaseCancelCalls, 1);
      assert.strictEqual(cancellationRegistrationDisposed, true);
    } finally {
      session.runWorkspaceAnalysisSession = originalRunWorkspaceAnalysisSession;
    }
  });
});
