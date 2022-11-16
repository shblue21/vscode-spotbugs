import { commands, ExtensionContext, window, workspace, WorkspaceConfiguration } from "vscode";
import * as command from "./command";

export async function activate(context: ExtensionContext)  {
  let disposable = commands.registerCommand("spotbugs.helloWorld", () => {
    // The code you place here will be executed every time your command is executed
    // Display a message box to the user
    window.showInformationMessage("Hello World from spotbugs!");
  });

  let autobuildTest = commands.registerCommand(
    "spotbugs.runFile", autoBuildConfig  );

  context.subscriptions.push(autobuildTest);
}

// This method is called when your extension is deactivated
export function deactivate() {}


export async function autoBuildConfig() {
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
      await commands.executeCommand(command.JAVA_BUILD_WORKSPACE, false);
      window.showInformationMessage("Build finished");
  } catch (err) {
      // do nothing.
  }
}