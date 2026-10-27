package com.spotbugs.vscode.runner.internal.command;

import com.spotbugs.vscode.runner.internal.AnalyzerService;
import com.spotbugs.vscode.runner.internal.config.AnalysisConfig;

interface AnalyzerServiceFactory {
    AnalyzerService create(AnalysisConfig config);
}
