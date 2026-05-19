export namespace JavaLanguageServerCommands {
  export const EXECUTE_WORKSPACE_COMMAND: string = 'java.execute.workspaceCommand';
  // vscode-java standardLanguageClient commands, true is full compile, false is incremental compile
  export const BUILD_WORKSPACE: string = 'java.project.build';
  export const GET_CLASSPATHS: string = 'java.project.getClasspaths';
  export const GET_ALL_JAVA_PROJECTS: string = 'java.project.getAll';
}

// VS Code command IDs owned by this extension (used in menus/UI)
export namespace SpotBugsCommands {
  export const RUN_ANALYSIS: string = 'spotbugs.run';
  export const RUN_WORKSPACE: string = 'spotbugs.runWorkspace';
  export const REVEAL_FINDING_SOURCE: string = 'spotbugs.revealFindingSource';
  export const OPEN_FINDING_DETAILS: string = 'spotbugs.openFindingDetails';
  export const FILTER_RESULTS: string = 'spotbugs.filterResults';
  export const EXPORT_SARIF: string = 'spotbugs.exportSarif';
  export const RESET_RESULTS: string = 'spotbugs.resetResults';
  export const SEARCH_RESULTS: string = 'spotbugs.searchResults';
  export const CLEAR_SEARCH: string = 'spotbugs.clearSearch';
  export const GROUP_RESULTS_BY: string = 'spotbugs.groupResultsBy';
  export const SORT_RESULTS_BY: string = 'spotbugs.sortResultsBy';
  export const OPEN_SETTINGS: string = 'spotbugs.openSettings';
}

// Java Language Server delegate command IDs (handled by the JDT LS plugin)
export namespace SpotBugsLSCommands {
  export const RUN_ANALYSIS: string = 'java.spotbugs.run';
}
