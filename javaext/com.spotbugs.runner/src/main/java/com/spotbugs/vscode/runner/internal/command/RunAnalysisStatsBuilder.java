package com.spotbugs.vscode.runner.internal.command;

import com.spotbugs.vscode.runner.api.RunAnalysisSummary;
import com.spotbugs.vscode.runner.internal.AnalyzerService;
import com.spotbugs.vscode.runner.internal.config.AnalysisConfig;

import edu.umd.cs.findbugs.Version;

final class RunAnalysisStatsBuilder {

    RunAnalysisSummary build(
            String targetPath,
            long startMillis,
            AnalysisConfig config,
            AnalyzerService analyzer,
            int findingCount
    ) {
        long elapsed = System.currentTimeMillis() - startMillis;
        return new RunAnalysisSummary(
                targetPath,
                elapsed,
                findingCount,
                Version.VERSION_STRING,
                analyzer.getLastTargetResolutionRootCount(),
                config.getRuntimeClasspaths().size(),
                config.getExtraAuxClasspaths().size(),
                analyzer.getLastAuxClasspathCount(),
                analyzer.getLastTargetCount(),
                config.getPlugins().size()
        );
    }
}
