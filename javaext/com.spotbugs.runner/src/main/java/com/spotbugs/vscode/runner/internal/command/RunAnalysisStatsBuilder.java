package com.spotbugs.vscode.runner.internal.command;

import com.spotbugs.vscode.runner.api.RunAnalysisSummary;
import com.spotbugs.vscode.runner.internal.AnalysisPreparationStats;
import com.spotbugs.vscode.runner.internal.config.AnalysisConfig;

import edu.umd.cs.findbugs.Version;

final class RunAnalysisStatsBuilder {

    RunAnalysisSummary build(
            String targetPath,
            long startMillis,
            AnalysisConfig config,
            AnalysisPreparationStats preparationStats,
            int findingCount
    ) {
        long elapsed = System.currentTimeMillis() - startMillis;
        return new RunAnalysisSummary(
                targetPath,
                elapsed,
                findingCount,
                Version.VERSION_STRING,
                preparationStats.getTargetResolutionRootCount(),
                config.getRuntimeClasspaths().size(),
                config.getExtraAuxClasspaths().size(),
                preparationStats.getAuxClasspathCount(),
                preparationStats.getTargetCount(),
                config.getPlugins().size()
        );
    }
}
