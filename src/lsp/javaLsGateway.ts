import { commands, type CancellationToken } from 'vscode';
import { JavaLanguageServerCommands, SpotBugsLSCommands } from '../constants/commands';
import { decodeCommandResponseEnvelope } from './commandResponseEnvelope';

export interface JavaLsClasspathResponse {
  projectRoot: string;
  classpaths: string[];
  modulepaths: string[];
}

export interface JavaLsProjectSettingsResponse {
  settings: Record<string, unknown>;
  declaredSourceOutputs: Record<string, string>;
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
  token?: CancellationToken
): Promise<JavaLsProjectSettingsResponse | undefined> {
  const response = await executeWorkspaceCommand<unknown>(
    SpotBugsLSCommands.PROJECT_SETTINGS,
    uri,
    ...(token ? [token] : [])
  );
  if (response === undefined || response === null) return undefined;
  const decoded = decodeCommandResponseEnvelope(typeof response === 'string' ? JSON.parse(response) : response);
  if (!decoded) throw new Error('Invalid Java project settings response.');
  if (decoded.errors?.length) throw new Error(decoded.errors.map((error) => error.message ?? error.code).join('; '));
  const value = decoded.results?.[0];
  const record = (input: unknown): input is Record<string, unknown> =>
    !!input && typeof input === 'object' && !Array.isArray(input);
  if (decoded.results?.length !== 1 || !record(value) || !record(value.settings)
      || !record(value.declaredSourceOutputs)
      || !Object.values(value.declaredSourceOutputs).every((output) => typeof output === 'string' && output.trim())) {
    throw new Error('Invalid Java project settings snapshot.');
  }
  return value as unknown as JavaLsProjectSettingsResponse;
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
