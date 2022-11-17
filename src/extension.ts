import { commands, Extension, ExtensionContext, window, workspace, WorkspaceConfiguration, Uri } from "vscode";
import { Command } from "./command";
import { getJavaExtensionApi } from './utils';
import { isClassFileExists } from "./javsClass";

export async function activate(context: ExtensionContext)  {

  let autobuildTest = commands.registerCommand(
    "spotbugs.runFile", oneCycle  );

  context.subscriptions.push(autobuildTest);
}

// This method is called when your extension is deactivated
export function deactivate() {}


export async function oneCycle(fileName: string | Uri) {
    const autobuildConfig: WorkspaceConfiguration = workspace.getConfiguration("java.autobuild");
    if (!autobuildConfig.enabled) {
        const ans = await window.showWarningMessage(
            "To get reliable analysis results, you should make sure that project is compiled first.\nContinue with SpotBugs analysis?",
            "Yes", "No");
        if (ans === "Yes") {
            await autobuildConfig.update("enabled", true);
        }
    }
    try {
      await commands.executeCommand(Command.JAVA_BUILD_WORKSPACE, false);
      if (!fileName && window.activeTextEditor) {
        fileName = window.activeTextEditor.document.uri;
      }
      if(fileName instanceof Uri) {
        await isClassFileExists(fileName.fsPath);
      } else{
        await isClassFileExists(fileName);
      }

      
      window.showInformationMessage("Build finished");
  } catch (err) {
      // do nothing.
  }
}