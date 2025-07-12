package com.spotbugs.runner.api;

public class AnalyzerResult {
    private String bugType;
    private String bugCategory;
    private String bugAbbreviation;
    private int bugRank;
    private String bugMessage;

    private String className;
    private String methodName;

    private int startLine;
    private int endLine;

    private String externalUrl;

    public String getBugType() {
        return bugType;
    }

    public void setBugType(String bugType) {
        this.bugType = bugType;
    }

    public String getBugCategory() {
        return bugCategory;
    }

    public void setBugCategory(String bugCategory) {
        this.bugCategory = bugCategory;
    }

    public String getBugAbbreviation() {
        return bugAbbreviation;
    }

    public void setBugAbbreviation(String bugAbbreviation) {
        this.bugAbbreviation = bugAbbreviation;
    }

    public int getBugRank() {
        return bugRank;
    }

    public void setBugRank(int bugRank) {
        this.bugRank = bugRank;
    }

    public String getBugMessage() {
        return bugMessage;
    }

    public void setBugMessage(String bugMessage) {
        this.bugMessage = bugMessage;
    }

    public String getClassName() {
        return className;
    }

    public void setClassName(String className) {
        this.className = className;
    }

    public String getMethodName() {
        return methodName;
    }

    public void setMethodName(String methodName) {
        this.methodName = methodName;
    }

    public int getStartLine() {
        return startLine;
    }

    public void setStartLine(int startLine) {
        this.startLine = startLine;
    }

    public int getEndLine() {
        return endLine;
    }

    public void setEndLine(int endLine) {
        this.endLine = endLine;
    }

    public String getExternalUrl() {
        return externalUrl;
    }

    public void setExternalUrl(String externalUrl) {
        this.externalUrl = externalUrl;
    }

    @Override
    public String toString() {
        return "AnalyzerResult [bugType=" + bugType + ", bugCategory=" + bugCategory + ", bugAbbreviation="
                + bugAbbreviation + ", bugRank=" + bugRank + ", bugMessage=" + bugMessage + ", className=" + className
                + ", methodName=" + methodName + ", startLine=" + startLine + ", endLine=" + endLine + ", externalUrl="
                + externalUrl + "]";
    }

}
