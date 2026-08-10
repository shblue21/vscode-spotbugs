package com.spotbugs.vscode.runner.internal.command;

import com.spotbugs.vscode.runner.internal.config.AnalysisConfig;

final class RunAnalysisRequest {
    private final String targetPath;
    private final AnalysisConfig config;
    private final boolean includeBaselineXml;

    RunAnalysisRequest(String targetPath, AnalysisConfig config, boolean includeBaselineXml) {
        this.targetPath = targetPath;
        this.config = config;
        this.includeBaselineXml = includeBaselineXml;
    }

    String getTargetPath() {
        return targetPath;
    }

    AnalysisConfig getConfig() {
        return config;
    }

    boolean isIncludeBaselineXml() {
        return includeBaselineXml;
    }
}
