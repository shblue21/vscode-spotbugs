"use strict";

import * as vscode from "vscode";

export const JAVA_EXECUTE_WORKSPACE_COMMAND = "java.execute.workspaceCommand";

export const CODEACTION_LOMBOK = "codeAction.lombok";

export const JAVA_CODEACTION_LOMBOK_ANNOTATIONS =
  "java.codeAction.lombok.getAnnotations";

export const JAVA_CODEACTION_LOMBOK = "java.codeAction.lombok";

export const GET_ALL_JAVA_PROJECTS = "java.project.getAll";

export const ORGANIZE_IMPORTS_SILENTLY = "java.edit.organizeImports";

// vscode-java standardLanguageClient commands, true is full compile, false is incremental compile
export const JAVA_BUILD_WORKSPACE = "java.workspace.compile";