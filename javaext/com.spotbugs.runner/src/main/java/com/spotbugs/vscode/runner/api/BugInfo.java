package com.spotbugs.vscode.runner.api;

import edu.umd.cs.findbugs.BugInstance;
import edu.umd.cs.findbugs.ClassAnnotation;
import edu.umd.cs.findbugs.FieldAnnotation;
import edu.umd.cs.findbugs.MethodAnnotation;
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
    private final String shortDescription;
    private final String longDescription;
    private final String detailHtml;
    private final String helpUri;
    private final String categoryAbbrev;
    private final Integer cweId;
    private final String instanceHash;
    private final String className;
    private final String methodName;
    private final String methodSignature;
    private final String fieldName;
    private String fullPath;

    public BugInfo(BugInstance bugInstance) {
        this.type = safeString(bugInstance.getType());
        this.rank = bugInstance.getBugRank();
        this.priority = safeString(bugInstance.getPriorityString());
        this.category = safeString(bugInstance.getBugPattern() != null ? bugInstance.getBugPattern().getCategory() : null);
        this.abbrev = safeString(bugInstance.getAbbrev());
        this.message = safeString(bugInstance.getMessage());
        this.shortDescription = optionalString(
                bugInstance.getBugPattern() != null ? bugInstance.getBugPattern().getShortDescription() : null
        );
        this.longDescription = optionalString(
                bugInstance.getBugPattern() != null ? bugInstance.getBugPattern().getDetailPlainText() : null
        );
        this.detailHtml = optionalString(
                bugInstance.getBugPattern() != null ? bugInstance.getBugPattern().getDetailText() : null
        );
        this.helpUri = optionalString(
                bugInstance.getBugPattern() != null
                        ? bugInstance.getBugPattern().getUri().map(java.net.URI::toString).orElse(null)
                        : null
        );
        this.categoryAbbrev = optionalString(
                bugInstance.getBugPattern() != null ? bugInstance.getBugPattern().getCategoryAbbrev() : null
        );
        this.cweId = optionalInteger(
                bugInstance.getBugPattern() != null ? bugInstance.getBugPattern().getCWEid() : 0
        );
        this.instanceHash = optionalString(bugInstance.getInstanceHash());

        ClassAnnotation classAnnotation = bugInstance.getPrimaryClass();
        this.className = optionalString(classAnnotation != null ? classAnnotation.getClassName() : null);

        MethodAnnotation methodAnnotation = bugInstance.getPrimaryMethod();
        this.methodName = optionalString(methodAnnotation != null ? methodAnnotation.getMethodName() : null);
        this.methodSignature = optionalString(
                methodAnnotation != null ? methodAnnotation.getMethodSignature() : null
        );

        FieldAnnotation fieldAnnotation = bugInstance.getPrimaryField();
        this.fieldName = optionalString(fieldAnnotation != null ? fieldAnnotation.getFieldName() : null);

        SourceLineAnnotation sla = bugInstance.getPrimarySourceLineAnnotation();
        if (sla != null) {
            this.sourceFile = safeString(sla.getSourceFile());
            int s = sla.getStartLine();
            int e = sla.getEndLine();
            this.startLine = s > 0 ? s : 0;
            this.endLine = e > 0 ? e : this.startLine;
            this.realSourcePath = safeString(sla.getRealSourcePath());
        } else {
            this.sourceFile = "";
            this.startLine = 0;
            this.endLine = 0;
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

    public String getShortDescription() {
        return shortDescription;
    }

    public String getLongDescription() {
        return longDescription;
    }

    public String getDetailHtml() {
        return detailHtml;
    }

    public String getHelpUri() {
        return helpUri;
    }

    public String getCategoryAbbrev() {
        return categoryAbbrev;
    }

    public Integer getCweId() {
        return cweId;
    }

    public String getInstanceHash() {
        return instanceHash;
    }

    public String getClassName() {
        return className;
    }

    public String getMethodName() {
        return methodName;
    }

    public String getMethodSignature() {
        return methodSignature;
    }

    public String getFieldName() {
        return fieldName;
    }

    public String getFullPath() {
        return fullPath;
    }

    public void setFullPath(String fullPath) {
        String trimmed = safeString(fullPath);
        this.fullPath = trimmed.isEmpty() ? null : trimmed;
    }
    // #endregion
    private static String safeString(String s) {
        return s == null ? "" : s;
    }

    private static String optionalString(String s) {
        String trimmed = safeString(s).trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static Integer optionalInteger(int value) {
        return value > 0 ? Integer.valueOf(value) : null;
    }
}
