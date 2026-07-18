package com.spotbugs.vscode.runner.api;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import com.spotbugs.vscode.runner.internal.SourcePathPolicy;

import edu.umd.cs.findbugs.BugAnnotation;
import edu.umd.cs.findbugs.BugInstance;
import edu.umd.cs.findbugs.ClassAnnotation;
import edu.umd.cs.findbugs.FieldAnnotation;
import edu.umd.cs.findbugs.I18N;
import edu.umd.cs.findbugs.MethodAnnotation;
import edu.umd.cs.findbugs.Priorities;
import edu.umd.cs.findbugs.SourceLineAnnotation;

public class BugInfo {
    private final String type;
    private final int rank;
    private final String priority;
    private final String category;
    private final String abbrev;
    private final String message;
    private final String longMessage;
    private final String categoryDescription;
    private final List<String> annotationMessages;
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
        this.priority = stablePriority(bugInstance.getPriority());
        this.category = safeString(bugInstance.getBugPattern() != null ? bugInstance.getBugPattern().getCategory() : null);
        this.abbrev = safeString(bugInstance.getAbbrev());
        this.message = safeString(bugInstance.getMessage());
        this.longMessage = optionalString(bugInstance.getMessageWithoutPrefix());
        this.categoryDescription = optionalString(I18N.instance().getBugCategoryDescription(this.category));
        this.annotationMessages = collectAnnotationMessages(bugInstance);
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
            String safeSourceFile = SourcePathPolicy.sourceFileName(sla.getSourceFile());
            String safeSourcePath = safeSourceFile == null
                    ? null
                    : SourcePathPolicy.relativeSourcePath(sla.getSourcePath());
            this.sourceFile = safeString(safeSourcePath == null ? null : safeSourceFile);
            int s = sla.getStartLine();
            int e = sla.getEndLine();
            this.startLine = s > 0 ? s : 0;
            this.endLine = e > 0 ? e : this.startLine;
            this.realSourcePath = safeString(safeSourcePath);
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

    public String getLongMessage() {
        return longMessage;
    }

    public String getCategoryDescription() {
        return categoryDescription;
    }

    public List<String> getAnnotationMessages() {
        return annotationMessages;
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

    private static String stablePriority(int priority) {
        switch (priority) {
            case Priorities.HIGH_PRIORITY:
                return "High";
            case Priorities.NORMAL_PRIORITY:
                return "Medium";
            case Priorities.LOW_PRIORITY:
                return "Low";
            case Priorities.EXP_PRIORITY:
                return "Experimental";
            case Priorities.IGNORE_PRIORITY:
                return "Ignore";
            default:
                return "Unknown";
        }
    }

    private static List<String> collectAnnotationMessages(BugInstance bugInstance) {
        List<String> messages = new ArrayList<>();
        for (BugAnnotation annotation : bugInstance.getAnnotations()) {
            String message;
            try {
                message = optionalString(annotation != null ? annotation.toString() : null);
            } catch (RuntimeException ignored) {
                continue;
            }
            if (message != null) {
                messages.add(message);
            }
        }
        return Collections.unmodifiableList(messages);
    }
}
