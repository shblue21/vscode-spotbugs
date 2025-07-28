import { extensions, Extension } from 'vscode';

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