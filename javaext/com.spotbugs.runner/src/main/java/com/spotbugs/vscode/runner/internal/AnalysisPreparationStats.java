package com.spotbugs.vscode.runner.internal;

/** Snapshot of completed preparation stages, including failed or cancelled analyses. */
public final class AnalysisPreparationStats {
    private final int targetCount;
    private final int targetResolutionRootCount;
    private final int auxClasspathCount;

    public AnalysisPreparationStats(int targetCount, int targetResolutionRootCount, int auxClasspathCount) {
        this.targetCount = targetCount;
        this.targetResolutionRootCount = targetResolutionRootCount;
        this.auxClasspathCount = auxClasspathCount;
    }

    public int getTargetCount() { return targetCount; }
    public int getTargetResolutionRootCount() { return targetResolutionRootCount; }
    public int getAuxClasspathCount() { return auxClasspathCount; }
}
