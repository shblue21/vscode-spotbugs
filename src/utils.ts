import { Uri, workspace, Extension, extensions } from "vscode";

const configPrefix = "spotbugs";

export function getRootWorkspacePath(): string {
  const hasWorkspaceRoot =
    workspace &&
    workspace.workspaceFolders &&
    workspace.workspaceFolders.length > 0;
  return hasWorkspaceRoot ? workspace.workspaceFolders![0].uri.fsPath : "";
}

export function getJavaExtension(): Extension<any> | undefined {
  return extensions.getExtension("redhat.java");
}

export async function getExtensionApi(): Promise<any> {
  const extension: Extension<any> | undefined = getJavaExtension();
  if (extension === undefined) {
    return undefined;
  }
  const extensionApi: any = await extension.activate();
  if (extensionApi.getClasspaths === undefined) {
    throw undefined;
  }
  return extensionApi;
}

export function getConfig(uri?: Uri): Config {
  const config = workspace.getConfiguration(
    configPrefix,
    uri
  ) as unknown as Config;

  if (!workspace.isTrusted) {
    const newConfig = {
      ...config,
      effort: "default",
    };
    return newConfig;
  }

  return config;
}
