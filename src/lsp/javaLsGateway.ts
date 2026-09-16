import { commands, type CancellationToken } from 'vscode';
import { JavaLanguageServerCommands } from '../constants/commands';

export interface JavaLsClasspathResponse {
  projectRoot: string;
  classpaths: string[];
  modulepaths: string[];
}

export type JavaLsProjectSettingsResponse = Record<string, unknown>;

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
  uri: string,
  scope: 'runtime' | 'test',
  token?: CancellationToken
): Promise<JavaLsClasspathResponse | undefined> {
  return executeWorkspaceCommand<JavaLsClasspathResponse>(
    JavaLanguageServerCommands.GET_CLASSPATHS,
    uri,
    JSON.stringify({ scope }),
    ...(token ? [token] : [])
  );
}

export async function requestJavaProjectSettings(
  uri: string,
  settingKeys: string[],
  token?: CancellationToken
): Promise<JavaLsProjectSettingsResponse | undefined> {
  return executeWorkspaceCommand<JavaLsProjectSettingsResponse>(
    JavaLanguageServerCommands.GET_PROJECT_SETTINGS,
    uri,
    settingKeys,
    ...(token ? [token] : [])
  );
}

export async function requestJavaIsTestFile(
  uri: string,
  token?: CancellationToken
): Promise<boolean | undefined> {
  return executeWorkspaceCommand<boolean>(
    JavaLanguageServerCommands.IS_TEST_FILE,
    uri,
    ...(token ? [token] : [])
  );
}

export async function requestAllJavaProjects(
  token?: CancellationToken
): Promise<string[] | undefined> {
  return executeWorkspaceCommand<string[]>(
    JavaLanguageServerCommands.GET_ALL_JAVA_PROJECTS,
    ...(token ? [token] : [])
  );
}

export async function requestWorkspaceBuild(
  full: boolean,
  token?: CancellationToken
): Promise<number | undefined> {
  const args = token ? [full, token] : [full];
  return commands.executeCommand<number>(
    JavaLanguageServerCommands.COMPILE_WORKSPACE,
    ...args
  );
}
