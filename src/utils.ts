import { extensions, Extension } from "vscode";

const JAVA_EXTENSION_ID = "redhat.java";

export async function getJavaExtension(): Promise<Extension<any> | undefined> {
  const javaExtension = extensions.getExtension(JAVA_EXTENSION_ID);
  if (!javaExtension) {
    return undefined;
  }
  if (!javaExtension.isActive) {
    await javaExtension.activate();
  }
  return javaExtension;
}

async function waitForLsReady(): Promise<void> {
  const javaLanguageSupport: Extension<any> | undefined = extensions.getExtension("redhat.java");
  if (javaLanguageSupport?.isActive) {
    const extensionApi: any = javaLanguageSupport.exports;
    if (!extensionApi) {
      throw new Error("Failed to get the extension API from redhat.java");
    }

    return extensionApi.serverReady();
  }

  throw new Error("redhat.java is not installed or activated");
}
