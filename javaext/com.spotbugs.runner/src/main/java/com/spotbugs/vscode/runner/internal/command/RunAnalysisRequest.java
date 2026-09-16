package com.spotbugs.vscode.runner.internal.command;

import com.spotbugs.vscode.runner.internal.config.AnalysisConfig;
import com.spotbugs.vscode.runner.internal.AnalysisInput;

final class RunAnalysisRequest {
    private final String targetPath;
    private final AnalysisConfig config;
    private final boolean includeBaselineXml;
    private final AnalysisInput[] inputs;

    RunAnalysisRequest(String targetPath, AnalysisConfig config, boolean includeBaselineXml, AnalysisInput[] inputs) {
        this.targetPath = targetPath;
        this.config = config;
        this.includeBaselineXml = includeBaselineXml;
        this.inputs = inputs.clone();
    }

    AnalysisInput[] getInputs() { return inputs.clone(); }

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
