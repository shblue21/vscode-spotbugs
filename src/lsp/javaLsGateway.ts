import { commands } from 'vscode';
import { JavaLanguageServerCommands } from '../constants/commands';

export async function executeWorkspaceCommand<T>(
  command: string,
  ...args: any[]
): Promise<T | undefined> {
  return commands.executeCommand<T>(
    JavaLanguageServerCommands.EXECUTE_WORKSPACE_COMMAND,
    command,
    ...args
  );
}

export async function getClasspaths(...args: any[]): Promise<unknown | undefined> {
  return commands.executeCommand(
    JavaLanguageServerCommands.GET_CLASSPATHS,
    ...args
  );
}

export async function getAllJavaProjects(): Promise<string[] | undefined> {
  return commands.executeCommand<string[]>(
    JavaLanguageServerCommands.GET_ALL_JAVA_PROJECTS
  );
}

export async function buildWorkspace(full: boolean): Promise<number | undefined> {
  return commands.executeCommand<number>(
    JavaLanguageServerCommands.BUILD_WORKSPACE,
    full
  );
}
