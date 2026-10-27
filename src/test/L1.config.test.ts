import * as assert from 'assert';
import * as path from 'path';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';

installVscodeMock();

describe('Config', () => {
  beforeEach(() => {
    resetVscodeMock();
  });

  it('enables source reveal on result selection by default', async () => {
    const configModule = await import('../core/config');
    const config = new configModule.Config({} as never);

    assert.strictEqual(config.revealSourceOnSelection, true);
  });

  it('reads disabled source reveal on result selection from configuration', async () => {
    resetVscodeMock({
      workspace: {
        getConfiguration: () => ({
          inspect: () => undefined,
          get: (key: string) =>
            key === 'results.revealSourceOnSelection' ? false : undefined,
        }),
      },
    } as never);
    const configModule = await import('../core/config');
    const config = new configModule.Config({} as never);

    assert.strictEqual(config.revealSourceOnSelection, false);
  });

  it('projects active registrations into the request using resource-relative paths without merging duplicates', async () => {
    const { buildAnalysisRequestPayload } = await import('../lsp/analysisRequestBuilder');
    const vscode = installVscodeMock();
    const workspaceA = vscode.Uri.file('/workspace-a');
    const workspaceB = vscode.Uri.file('/workspace-b');
    const registrations = [
      { id: 'security', path: 'plugins/findsecbugs.jar', enabled: true, detectors: { ['example.Check']: false } },
      { id: 'disabled', path: '/missing.jar', enabled: false, detectors: { ['missing.Check']: true } },
      { id: 'second', path: 'plugins/findsecbugs.jar', enabled: true, detectors: {} },
    ];
    const original = structuredClone(registrations);
    resetVscodeMock({
      workspace: {
        workspaceFolders: [
          { name: 'workspace-a', uri: workspaceA },
          { name: 'workspace-b', uri: workspaceB },
        ],
        getConfiguration: () => ({
          get: () => undefined,
          inspect: (key: string) => key === 'plugins.registrations'
            ? { workspaceValue: registrations }
            : undefined,
        }),
        getWorkspaceFolder: (uri: typeof workspaceA) =>
          uri.fsPath.startsWith(workspaceB.fsPath)
            ? { name: 'workspace-b', uri: workspaceB }
            : undefined,
      },
    } as never);
    const configModule = await import('../core/config');
    const config = new configModule.Config({} as never);

    const resource = vscode.Uri.file('/workspace-b/src/main/java/App.java') as never;
    const payload = buildAnalysisRequestPayload(config.getAnalysisSettings(resource), {});

    assert.deepStrictEqual(config.getConfiguredPlugins().map((plugin) => plugin.enabled), [true, false, true]);
    assert.deepStrictEqual(payload.plugins, [
      { path: path.resolve('/workspace-b', 'plugins/findsecbugs.jar'), detectors: { ['example.Check']: false } },
      { path: path.resolve('/workspace-b', 'plugins/findsecbugs.jar'), detectors: {} },
    ]);
    assert.deepStrictEqual(registrations, original);

    registrations.forEach((registration) => { registration.enabled = false; });
    config.init();
    assert.strictEqual(buildAnalysisRequestPayload(config.getAnalysisSettings(resource), {}).plugins, undefined);
  });

  it('blocks analysis when a disabled registration has an invalid ID', async () => {
    const configModule = await import('../core/config');
    const { createAnalysisExecutor } = await import('../services/analysisExecution');
    resetVscodeMock({ workspace: { getConfiguration: () => ({
      get: () => undefined,
      inspect: (key: string) => key === 'plugins.registrations'
        ? { workspaceValue: [{ id: '', path: '/missing.jar', enabled: false, detectors: {} }] } : undefined,
    }) } } as never);
    const config = new configModule.Config({} as never);
    let backendCalls = 0;
    const executor = createAnalysisExecutor({
      logger: { log: () => undefined, error: () => undefined },
      runSpotBugsAnalysis: async () => { backendCalls++; return JSON.stringify({ results: [] }); },
    });
    const outcome = await executor.run(config.getAnalysisSettings(), {
      inputs: [{ kind: 'artifact', path: '/workspace/Example.class' }], environment: {}, sourceLookup: {},
    });
    assert.strictEqual(outcome.failure?.code, 'CFG_PLUGINS_INVALID');
    assert.strictEqual(backendCalls, 0);
  });
});
