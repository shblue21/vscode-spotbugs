package com.spotbugs.vscode.runner.api;

import edu.umd.cs.findbugs.BugInstance;
import edu.umd.cs.findbugs.SourceLineAnnotation;

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
    private final String realSourcePath;

    public BugInfo(BugInstance bugInstance) {
        this.type = safeString(bugInstance.getType());
        this.rank = bugInstance.getBugRank();
        this.priority = safeString(bugInstance.getPriorityString());
        this.category = safeString(bugInstance.getBugPattern() != null ? bugInstance.getBugPattern().getCategory() : null);
        this.abbrev = safeString(bugInstance.getAbbrev());
        this.message = safeString(bugInstance.getMessage());
        SourceLineAnnotation sla = bugInstance.getPrimarySourceLineAnnotation();
        if (sla != null) {
            this.sourceFile = safeString(sla.getSourceFile());
            int s = sla.getStartLine();
            int e = sla.getEndLine();
            this.startLine = s > 0 ? s : 1;
            this.endLine = e > 0 ? e : this.startLine;
            this.realSourcePath = safeString(sla.getRealSourcePath());
        } else {
            this.sourceFile = "";
            this.startLine = 1;
            this.endLine = 1;
            this.realSourcePath = "";
        }
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

    public String getRealSourcePath() {
        return realSourcePath;
    }
    // #endregion
    private static String safeString(String s) {
        return s == null ? "" : s;
    }
}
