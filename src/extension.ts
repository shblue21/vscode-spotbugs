import { commands, ExtensionContext,window } from "vscode";

const extensionName = process.env.EXTENSION_NAME || "spotbugs";
const extensionVersion = process.env.EXTENSION_VERSION || "0.0.0";

export function activate(context: ExtensionContext) {
  let disposable = commands.registerCommand("spotbugs.helloWorld", () => {
    // The code you place here will be executed every time your command is executed
    // Display a message box to the user
    window.showInformationMessage("Hello World from spotbugs!");
  });

  const test = commands.registerCommand(
    "spotbugs.runFile",
	() => {
		window.showInformationMessage("Hello World from spotbugs!");
	}
  );

  context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
