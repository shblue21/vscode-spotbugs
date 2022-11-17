import { Uri, workspace, Extension, extensions } from "vscode";
import { JAVA_EXTENSION_ID } from "./constant";

const configPrefix = "spotbugs";

export function getJavaExtension(): Extension<any> | undefined {
  return extensions.getExtension(JAVA_EXTENSION_ID);
}

export async function getJavaExtensionApi(): Promise<any> {
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
