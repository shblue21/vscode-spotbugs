"use strict";

import * as vscode from "vscode";
import { JavaLanguageServerCommands } from "./constants/commands";

export async function executeJavaLanguageServerCommand<T>(...rest: any[]): Promise<T | undefined> {
  return vscode.commands.executeCommand<T>(
    JavaLanguageServerCommands.EXECUTE_WORKSPACE_COMMAND,
    ...rest,
  );
}
