import { commands } from 'vscode';
import { Notifier } from '../core/notifier';
import { JavaLanguageServerCommands } from '../constants/commands';
import { ensureJavaCommandsAvailable } from '../core/utils';
import { Logger } from '../core/logger';

export async function buildWorkspaceAuto(notifier?: Notifier): Promise<number | undefined> {
  notifier?.info('Starting Java workspace build...');
  Logger.log('Starting Java workspace build...');

  const waited = await ensureJavaCommandsAvailable([
    JavaLanguageServerCommands.BUILD_WORKSPACE,
    JavaLanguageServerCommands.GET_CLASSPATHS,
  ]);
  Logger.log(`Checked Java command availability (waited=${waited})`);
  try {
    const available = await commands.getCommands(true);
    const hasBuild = available.includes(JavaLanguageServerCommands.BUILD_WORKSPACE);
    const hasGetCp = available.includes(JavaLanguageServerCommands.GET_CLASSPATHS);
    Logger.log(`Commands available - build:${hasBuild} getClasspaths:${hasGetCp}`);
  } catch {
    // ignore
  }

  const t0 = Date.now();
  let result: number | undefined;
  try {
    Logger.log('Invoking java.project.build(false) - incremental build');
    result = await commands.executeCommand<number>(JavaLanguageServerCommands.BUILD_WORKSPACE, false);
    Logger.log(`java.project.build(false) returned: ${String(result)}`);
  } catch (e) {
    Logger.log(`Error during java.project.build(false): ${e instanceof Error ? e.message : String(e)}`);
  }
  if (result !== 0) {
    try {
      Logger.log('Retrying with java.project.build(true) - full build');
      result = await commands.executeCommand<number>(JavaLanguageServerCommands.BUILD_WORKSPACE, true);
      Logger.log(`java.project.build(true) returned: ${String(result)}`);
    } catch (e) {
      Logger.log(`Error during java.project.build(true): ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const t1 = Date.now();
  Logger.log(`Build duration: ${t1 - t0} ms`);
  return result;
}

