export namespace JavaLanguageServerCommands {
  export const EXECUTE_WORKSPACE_COMMAND: string = 'java.execute.workspaceCommand';
  // vscode-java standardLanguageClient command, true is full compile, false is incremental compile
  export const COMPILE_WORKSPACE: string = 'java.workspace.compile';
  export const GET_CLASSPATHS: string = 'java.project.getClasspaths';
  export const IS_TEST_FILE: string = 'java.project.isTestFile';
  export const GET_ALL_JAVA_PROJECTS: string = 'java.project.getAll';
}

export enum JavaCompileWorkspaceStatus {
  failed = 0,
  succeeded = 1,
  cancelled = 3,
}

// VS Code command IDs owned by this extension (used in menus/UI)
export namespace SpotBugsCommands {
  export const ANALYZE_SOURCE: string = 'spotbugs.analyzeSource';
  export const ANALYZE_ARTIFACTS: string = 'spotbugs.analyzeArtifacts';
  export const ANALYZE_PROJECT: string = 'spotbugs.analyzeProject';
  export const ANALYZE_WORKSPACE: string = 'spotbugs.analyzeWorkspace';
  export const REVEAL_FINDING_SOURCE: string = 'spotbugs.revealFindingSource';
  export const OPEN_FINDING_DETAILS: string = 'spotbugs.openFindingDetails';
  export const SUPPRESS_FINDINGS: string = 'spotbugs.suppressFindings';
  export const CREATE_BASELINE: string = 'spotbugs.createBaseline';
  export const FILTER_RESULTS: string = 'spotbugs.filterResults';
  export const EXPORT_SARIF: string = 'spotbugs.exportSarif';
  export const EXPORT_HTML: string = 'spotbugs.exportHtml';
  export const RESET_RESULTS: string = 'spotbugs.resetResults';
  export const SEARCH_RESULTS: string = 'spotbugs.searchResults';
  export const CLEAR_SEARCH: string = 'spotbugs.clearSearch';
  export const GROUP_RESULTS_BY: string = 'spotbugs.groupResultsBy';
  export const SORT_RESULTS_BY: string = 'spotbugs.sortResultsBy';
  export const OPEN_SETTINGS: string = 'spotbugs.openSettings';
  export const REFRESH_PLUGIN_INVENTORY: string = 'spotbugs.refreshPluginInventory';
  export const ADD_PLUGIN_JARS: string = 'spotbugs.addPluginJars';
  export const REMOVE_PLUGIN_JAR: string = 'spotbugs.removePluginJar';
  export const ADD_FILTER_FILES: string = 'spotbugs.addFilterFiles';
  export const REMOVE_FILTER_FILE: string = 'spotbugs.removeFilterFile';
}

// Java Language Server delegate command IDs (handled by the JDT LS plugin)
export namespace SpotBugsLSCommands {
  export const PROJECT_SETTINGS: string = 'java.spotbugs.project.settings';
  export const ANALYZE_SOURCES: string = 'java.spotbugs.analyzeSources';
  export const ANALYZE_ARTIFACTS: string = 'java.spotbugs.analyzeArtifacts';
  export const PLUGIN_INVENTORY: string = 'java.spotbugs.plugins.inventory';
}
