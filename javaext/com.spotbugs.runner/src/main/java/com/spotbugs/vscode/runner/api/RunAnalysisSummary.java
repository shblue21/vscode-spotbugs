package com.spotbugs.vscode.runner.api;

public final class RunAnalysisSummary {
    private final String target;
    private final long durationMs;
    private final int findingCount;
    private final String spotbugsVersion;
    private final int targetResolutionRootCount;
    private final int runtimeClasspathCount;
    private final int extraAuxClasspathCount;
    private final int auxClasspathCount;
    private final int targetCount;
    private final int pluginCount;

    public RunAnalysisSummary(
            String target,
            long durationMs,
            int findingCount,
            String spotbugsVersion,
            int targetResolutionRootCount,
            int runtimeClasspathCount,
            int extraAuxClasspathCount,
            int auxClasspathCount,
            int targetCount,
            int pluginCount
    ) {
        this.target = target;
        this.durationMs = durationMs;
        this.findingCount = findingCount;
        this.spotbugsVersion = spotbugsVersion;
        this.targetResolutionRootCount = targetResolutionRootCount;
        this.runtimeClasspathCount = runtimeClasspathCount;
        this.extraAuxClasspathCount = extraAuxClasspathCount;
        this.auxClasspathCount = auxClasspathCount;
        this.targetCount = targetCount;
        this.pluginCount = pluginCount;
    }

    public String getTarget() {
        return target;
    }

    public long getDurationMs() {
        return durationMs;
    }

    public int getFindingCount() {
        return findingCount;
    }

    public String getSpotbugsVersion() {
        return spotbugsVersion;
    }

    public int getTargetResolutionRootCount() {
        return targetResolutionRootCount;
    }

    public int getRuntimeClasspathCount() {
        return runtimeClasspathCount;
    }

    public int getExtraAuxClasspathCount() {
        return extraAuxClasspathCount;
    }

    public int getAuxClasspathCount() {
        return auxClasspathCount;
    }

    public int getTargetCount() {
        return targetCount;
    }

    public int getPluginCount() {
        return pluginCount;
    }
}
