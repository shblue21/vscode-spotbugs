package com.spotbugs.vscode.runner.api;

public final class AnalysisReportSummary {
    private final int analyzedCodeSize;
    private final int analyzedClassCount;
    private final int analyzedPackageCount;

    public AnalysisReportSummary(int analyzedCodeSize, int analyzedClassCount, int analyzedPackageCount) {
        this.analyzedCodeSize = analyzedCodeSize;
        this.analyzedClassCount = analyzedClassCount;
        this.analyzedPackageCount = analyzedPackageCount;
    }

    public int getAnalyzedCodeSize() {
        return analyzedCodeSize;
    }

    public int getAnalyzedClassCount() {
        return analyzedClassCount;
    }

    public int getAnalyzedPackageCount() {
        return analyzedPackageCount;
    }
}
