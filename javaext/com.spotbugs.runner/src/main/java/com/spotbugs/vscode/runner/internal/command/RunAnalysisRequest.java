package com.spotbugs.vscode.runner.internal.command;

import com.spotbugs.vscode.runner.internal.config.AnalysisConfig;

final class RunAnalysisRequest {
    private final String targetPath;
    private final AnalysisConfig config;

    RunAnalysisRequest(String targetPath, AnalysisConfig config) {
        this.targetPath = targetPath;
        this.config = config;
    }

    String getTargetPath() {
        return targetPath;
    }

    AnalysisConfig getConfig() {
        return config;
    }
}
