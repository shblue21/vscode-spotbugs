package com.spotbugs.vscode.runner.internal.command;

import com.spotbugs.vscode.runner.internal.AnalyzerService;

interface AnalyzerServiceFactory {
    AnalyzerService create();
}
