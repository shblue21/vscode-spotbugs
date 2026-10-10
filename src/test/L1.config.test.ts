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

  it('resolves plugin paths against the resource workspace folder', async () => {
    const vscode = installVscodeMock();
    const workspaceA = vscode.Uri.file('/workspace-a');
    const workspaceB = vscode.Uri.file('/workspace-b');
    resetVscodeMock({
      workspace: {
        workspaceFolders: [
          { name: 'workspace-a', uri: workspaceA },
          { name: 'workspace-b', uri: workspaceB },
        ],
        getConfiguration: () => ({
          get: () => undefined,
          inspect: (key: string) => key === 'plugins.paths'
            ? { workspaceValue: ['plugins/findsecbugs.jar', '/opt/spotbugs/custom.jar'] }
            : { workspaceValue: ['/opt/spotbugs/custom.jar'], globalValue: ['plugins/findsecbugs.jar'] },
        }),
        getWorkspaceFolder: (uri: typeof workspaceA) =>
          uri.fsPath.startsWith(workspaceB.fsPath)
            ? { name: 'workspace-b', uri: workspaceB }
            : undefined,
      },
    } as never);
    const configModule = await import('../core/config');
    const config = new configModule.Config({} as never);

    const settings = config.getAnalysisSettings(
      vscode.Uri.file('/workspace-b/src/main/java/App.java') as never
    );

    assert.deepStrictEqual(config.getConfiguredPlugins().map((plugin) => plugin.enabled), [true, false]);
    assert.deepStrictEqual(settings.plugins, [
      path.resolve('/workspace-b', 'plugins/findsecbugs.jar'),
    ]);
  });
});
