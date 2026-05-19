import { commands } from 'vscode';

const EXTENSION_SETTINGS_FILTER = '@ext:shblue21.vscode-spotbugs';

export async function openSettings(): Promise<void> {
  await commands.executeCommand('workbench.action.openSettings', EXTENSION_SETTINGS_FILTER);
}
