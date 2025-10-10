export namespace JavaLanguageServerCommands {
  export const EXECUTE_WORKSPACE_COMMAND: string = 'java.execute.workspaceCommand';
  // vscode-java standardLanguageClient commands, true is full compile, false is incremental compile
  export const BUILD_WORKSPACE: string = 'java.project.build';
  export const GET_CLASSPATHS: string = 'java.project.getClasspaths';
  export const GET_ALL_JAVA_PROJECTS: string = 'java.project.getAll';
  export const ORGANIZE_IMPORTS_SILENTLY = 'java.edit.organizeImports';
}

// VS Code command IDs owned by this extension (used in menus/UI)
export namespace SpotBugsCommands {
  export const RUN_ANALYSIS: string = 'spotbugs.run';
  export const RUN_WORKSPACE: string = 'spotbugs.runWorkspace';
  export const OPEN_BUG_LOCATION: string = 'spotbugs.openBugLocation';
  export const EXPORT_SARIF: string = 'spotbugs.exportSarif';
}

// Java Language Server delegate command IDs (handled by the JDT LS plugin)
export namespace SpotBugsLSCommands {
  export const RUN_ANALYSIS: string = 'java.spotbugs.run';
}

export namespace VsCodeCommands {
  export const OPEN: string = 'vscode.open';
}
