import * as assert from 'assert';
import type { CancellationToken } from 'vscode';
import {
  JavaCompileWorkspaceStatus,
  JavaLanguageServerCommands,
} from '../constants/commands';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';

function clearModules(): void {
  delete require.cache[require.resolve('../lsp/javaLsGateway')];
  delete require.cache[require.resolve('../services/workspaceBuildService')];
}

async function invokeBuild(
  execute: (...args: unknown[]) => unknown,
  token?: CancellationToken
): Promise<{ result: number | undefined; calls: unknown[][] }> {
  const calls: unknown[][] = [];
  installVscodeMock({
    commands: {
      getCommands: async () => [JavaLanguageServerCommands.COMPILE_WORKSPACE],
      executeCommand: async (...args: unknown[]) => {
        calls.push(args);
        return execute(...args);
      },
    },
  });
  clearModules();
  const service =
    require('../services/workspaceBuildService') as typeof import('../services/workspaceBuildService');
  const result = await service.buildWorkspace(
    { mode: 'auto', ensureCommands: false },
    token
  );
  return { result, calls };
}

describe('workspaceBuildService', () => {
  beforeEach(() => {
    installVscodeMock();
    resetVscodeMock();
    clearModules();
  });

  it('passes the token to workspace compilation and does not retry a cancelled build', async () => {
    const token = { isCancellationRequested: false } as any;
    const { result, calls } = await invokeBuild(
      () => JavaCompileWorkspaceStatus.cancelled,
      token
    );

    assert.strictEqual(result, JavaCompileWorkspaceStatus.cancelled);
    assert.deepStrictEqual(calls, [
      [JavaLanguageServerCommands.COMPILE_WORKSPACE, false, token],
    ]);
  });

  it('normalizes a successful incremental compile without starting a full retry', async () => {
    const { result, calls } = await invokeBuild(
      () => JavaCompileWorkspaceStatus.succeeded
    );

    assert.strictEqual(result, 0);
    assert.deepStrictEqual(calls, [
      [JavaLanguageServerCommands.COMPILE_WORKSPACE, false],
    ]);
  });
});
