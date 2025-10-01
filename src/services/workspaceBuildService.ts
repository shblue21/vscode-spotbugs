import { commands } from 'vscode';
import { Notifier } from '../core/notifier';
import { JavaLanguageServerCommands } from '../constants/commands';
import { ensureJavaCommandsAvailable } from '../core/utils';
import { Logger } from '../core/logger';

export type BuildMode = 'auto' | 'incremental' | 'full';

export interface BuildWorkspaceOptions {
  mode?: BuildMode;
  notifier?: Notifier;
  ensureCommands?: boolean;
}

export async function buildWorkspace(
  options: BuildWorkspaceOptions = {}
): Promise<number | undefined> {
  const { mode = 'auto', notifier, ensureCommands = true } = options;

  notifier?.info('Starting Java workspace build...');
  Logger.log(`Starting Java workspace build (mode=${mode})...`);

  if (ensureCommands) {
    const waited = await ensureJavaCommandsAvailable([
      JavaLanguageServerCommands.BUILD_WORKSPACE,
      JavaLanguageServerCommands.GET_CLASSPATHS,
    ]);
    Logger.log(`Checked Java command availability (waited=${waited})`);
  }

  try {
    const available = await commands.getCommands(true);
    const hasBuild = available.includes(JavaLanguageServerCommands.BUILD_WORKSPACE);
    const hasGetCp = available.includes(JavaLanguageServerCommands.GET_CLASSPATHS);
    Logger.log(`Commands available - build:${hasBuild} getClasspaths:${hasGetCp}`);
  } catch {
    // ignore
  }

  const tryBuild = async (full: boolean): Promise<number | undefined> => {
    const modeLabel = full ? 'full' : 'incremental';
    try {
      Logger.log(`Invoking java.project.build(${full}) - ${modeLabel} build`);
      const value = await commands.executeCommand<number>(
        JavaLanguageServerCommands.BUILD_WORKSPACE,
        full
      );
      Logger.log(`java.project.build(${full}) returned: ${String(value)}`);
      return value;
    } catch (e) {
      Logger.log(
        `Error during java.project.build(${full}): ${e instanceof Error ? e.message : String(e)}`
      );
      return undefined;
    }
  };

  const t0 = Date.now();
  let result: number | undefined;

  if (mode !== 'full') {
    result = await tryBuild(false);
  }

  const shouldRunFull = mode === 'full' || (mode === 'auto' && result !== 0);
  if (shouldRunFull) {
    result = await tryBuild(true);
  }

  const t1 = Date.now();
  Logger.log(`Build duration: ${t1 - t0} ms (mode=${mode}, result=${String(result)})`);
  return result;
}

export async function buildWorkspaceAuto(notifier?: Notifier): Promise<number | undefined> {
  return buildWorkspace({ mode: 'auto', notifier });
}
