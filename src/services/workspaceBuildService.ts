import { commands, type CancellationToken } from 'vscode';
import {
  JavaCompileWorkspaceStatus,
  JavaLanguageServerCommands,
} from '../constants/commands';
import { ensureJavaCommandsAvailable } from '../core/utils';
import { Logger } from '../core/logger';
import { requestWorkspaceBuild } from '../lsp/javaLsGateway';

export type BuildMode = 'auto' | 'incremental' | 'full';

export interface BuildWorkspaceOptions {
  mode?: BuildMode;
  ensureCommands?: boolean;
}

export async function buildWorkspace(
  options: BuildWorkspaceOptions = {},
  token?: CancellationToken
): Promise<number | undefined> {
  const { mode = 'auto', ensureCommands = true } = options;

  Logger.log(`Starting Java workspace build (mode=${mode})...`);

  if (ensureCommands) {
    const waited = await ensureJavaCommandsAvailable([
      JavaLanguageServerCommands.COMPILE_WORKSPACE,
      JavaLanguageServerCommands.GET_CLASSPATHS,
    ]);
    Logger.log(`Checked Java command availability (waited=${waited})`);
  }

  try {
    const available = await commands.getCommands(true);
    const hasBuild = available.includes(JavaLanguageServerCommands.COMPILE_WORKSPACE);
    const hasGetCp = available.includes(JavaLanguageServerCommands.GET_CLASSPATHS);
    Logger.log(`Commands available - build:${hasBuild} getClasspaths:${hasGetCp}`);
  } catch {
    // ignore
  }

  const tryBuild = async (full: boolean): Promise<number | undefined> => {
    if (token?.isCancellationRequested) {
      return JavaCompileWorkspaceStatus.cancelled;
    }
    const modeLabel = full ? 'full' : 'incremental';
    try {
      Logger.log(`Invoking java.workspace.compile(${full}) - ${modeLabel} build`);
      const value = await requestWorkspaceBuild(full, token);
      Logger.log(`java.workspace.compile(${full}) returned: ${String(value)}`);
      return normalizeCompileStatus(value);
    } catch (e) {
      if (token?.isCancellationRequested) {
        Logger.log('Java workspace build cancelled by user.');
        return JavaCompileWorkspaceStatus.cancelled;
      }
      Logger.log(
        `Error during java.workspace.compile(${full}): ${e instanceof Error ? e.message : String(e)}`
      );
      return undefined;
    }
  };

  const t0 = Date.now();
  let result: number | undefined;

  if (mode !== 'full') {
    result = await tryBuild(false);
  }

  if (
    token?.isCancellationRequested ||
    result === JavaCompileWorkspaceStatus.cancelled
  ) {
    return JavaCompileWorkspaceStatus.cancelled;
  }

  const shouldRunFull = mode === 'full' || (mode === 'auto' && result !== 0);
  if (shouldRunFull) {
    result = await tryBuild(true);
  }

  const t1 = Date.now();
  Logger.log(`Build duration: ${t1 - t0} ms (mode=${mode}, result=${String(result)})`);
  return result;
}

function normalizeCompileStatus(status: number | undefined): number | undefined {
  if (status === JavaCompileWorkspaceStatus.succeeded) return 0;
  if (status === JavaCompileWorkspaceStatus.failed) return 1;
  return status;
}

export async function buildWorkspaceAuto(
  token?: CancellationToken
): Promise<number | undefined> {
  return buildWorkspace({ mode: 'auto' }, token);
}
