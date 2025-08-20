export namespace JavaLanguageServerCommands {
    export const EXECUTE_WORKSPACE_COMMAND: string = 'java.execute.workspaceCommand';
    // vscode-java standardLanguageClient commands, true is full compile, false is incremental compile
    export const BUILD_WORKSPACE: string = 'java.project.build';
    export const GET_CLASSPATHS: string = 'java.project.getClasspaths';
    export const CODEACTION_LOMBOK: string = 'codeAction.lombok';
    export const CODEACTION_LOMBOK_ANNOTATIONS: string = 'java.codeAction.lombok.getAnnotations';
    export const GET_ALL_JAVA_PROJECTS: string = 'java.project.getAll';
    export const ORGANIZE_IMPORTS_SILENTLY = "java.edit.organizeImports"; 
}


export namespace SpotBugsCommands {
    export const RUN_ANALYSIS: string = 'java.spotbugs.run';
    export const RUN_WORKSPACE: string = 'java.spotbugs.runWorkspace';
    export const OPEN_BUG_LOCATION: string = 'spotbugs.openBugLocation';
}

export namespace VsCodeCommands {
    export const OPEN: string = 'vscode.open';
}