import { extensions, Extension, commands } from 'vscode';

const JAVA_EXTENSION_ID = 'redhat.java';

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

export async function ensureJavaCommandsAvailable(
  required: string[] = [],
  timeoutMs = 15000,
): Promise<boolean> {
  // Proactively activate the Java extension (no reliance on its API)
  try {
    const ext = extensions.getExtension(JAVA_EXTENSION_ID);
    if (ext && !ext.isActive) {
      await ext.activate();
    }
  } catch {
    // ignore
  }

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const available = await commands.getCommands(true);
      const ok = required.every((c) => available.includes(c));
      if (ok) return true;
    } catch {
      // ignore and retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  // Timeout: best-effort proceed
  return false;
}
