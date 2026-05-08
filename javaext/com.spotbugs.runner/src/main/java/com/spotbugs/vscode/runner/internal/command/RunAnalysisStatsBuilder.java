package com.spotbugs.vscode.runner.internal.command;

import java.util.HashMap;
import java.util.Map;

import com.spotbugs.vscode.runner.internal.AnalyzerService;
import com.spotbugs.vscode.runner.internal.config.AnalysisConfig;

import edu.umd.cs.findbugs.Version;

final class RunAnalysisStatsBuilder {

    Map<String, Object> build(
            String targetPath,
            long startMillis,
            AnalysisConfig config,
            AnalyzerService analyzer,
            int findingCount
    ) {
        long elapsed = System.currentTimeMillis() - startMillis;
        Map<String, Object> stats = new HashMap<>();
        stats.put("target", targetPath);
        stats.put("durationMs", Long.valueOf(elapsed));
        stats.put("findingCount", Integer.valueOf(findingCount));
        stats.put("spotbugsVersion", Version.VERSION_STRING);
        stats.put("targetResolutionRootCount", Integer.valueOf(analyzer.getLastTargetResolutionRootCount()));
        stats.put("runtimeClasspathCount", Integer.valueOf(config.getRuntimeClasspaths().size()));
        stats.put("extraAuxClasspathCount", Integer.valueOf(config.getExtraAuxClasspaths().size()));
        stats.put("auxClasspathCount", Integer.valueOf(analyzer.getLastAuxClasspathCount()));
        stats.put("targetCount", Integer.valueOf(analyzer.getLastTargetCount()));
        stats.put("pluginCount", Integer.valueOf(config.getPlugins().size()));
        return stats;
    }
}
