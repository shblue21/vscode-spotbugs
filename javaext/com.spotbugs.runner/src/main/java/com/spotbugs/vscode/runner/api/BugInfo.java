package com.spotbugs.vscode.runner.api;

import edu.umd.cs.findbugs.BugInstance;

public class BugInfo {
    private final String type;
    private final int rank;
    private final String priority;
    private final String category;
    private final String abbrev;
    private final String message;
    private final String sourceFile;
    private final int startLine;
    private final int endLine;

    public BugInfo(BugInstance bugInstance) {
        this.type = bugInstance.getType();
        this.rank = bugInstance.getBugRank();
        this.priority = bugInstance.getPriorityString();
        this.category = bugInstance.getBugPattern().getCategory();
        this.abbrev = bugInstance.getAbbrev();
        this.message = bugInstance.getMessage();
        this.sourceFile = bugInstance.getPrimarySourceLineAnnotation().getSourceFile();
        this.startLine = bugInstance.getPrimarySourceLineAnnotation().getStartLine();
        this.endLine = bugInstance.getPrimarySourceLineAnnotation().getEndLine();
    }

    // #region Getters
    public String getType() {
        return type;
    }

    public int getRank() {
        return rank;
    }

    public String getPriority() {
        return priority;
    }

    public String getCategory() {
        return category;
    }

    public String getAbbrev() {
        return abbrev;
    }

    public String getMessage() {
        return message;
    }

    public String getSourceFile() {
        return sourceFile;
    }

    public int getStartLine() {
        return startLine;
    }

    public int getEndLine() {
        return endLine;
    }
    // #endregion
}
