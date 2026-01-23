import { commands } from 'vscode';
import { JavaLanguageServerCommands } from '../constants/commands';

export interface JavaLsClasspathResponse {
  classpaths?: string[];
  sourcepaths?: string[];
  output?: string;
  [key: string]: unknown;
}

export async function executeWorkspaceCommand<T>(
  command: string,
  ...args: unknown[]
): Promise<T | undefined> {
  return commands.executeCommand<T>(
    JavaLanguageServerCommands.EXECUTE_WORKSPACE_COMMAND,
    command,
    ...args
  );
}

export async function requestJavaClasspaths(
  ...args: unknown[]
): Promise<JavaLsClasspathResponse | undefined> {
  return commands.executeCommand<JavaLsClasspathResponse>(
    JavaLanguageServerCommands.GET_CLASSPATHS,
    ...args
  );
}

export async function requestAllJavaProjects(): Promise<string[] | undefined> {
  return commands.executeCommand<string[]>(
    JavaLanguageServerCommands.GET_ALL_JAVA_PROJECTS
  );
}

export async function requestWorkspaceBuild(
  full: boolean
): Promise<number | undefined> {
  return commands.executeCommand<number>(
    JavaLanguageServerCommands.BUILD_WORKSPACE,
    full
  );
}
