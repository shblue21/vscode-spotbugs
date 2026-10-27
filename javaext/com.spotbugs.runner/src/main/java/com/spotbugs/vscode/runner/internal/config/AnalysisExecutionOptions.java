package com.spotbugs.vscode.runner.internal.config;

import java.util.List;
import java.util.ArrayList;

import com.spotbugs.vscode.runner.api.AnalysisPlugin;

/** Validated, fully resolved options for one engine execution. */
public final class AnalysisExecutionOptions {
    private final Effort effort;
    private final int rankThreshold;
    private final int confidenceThreshold;
    private final List<String> includeFilterPaths;
    private final List<String> excludeFilterPaths;
    private final List<String> excludeBaselineBugsPaths;
    private final List<AnalysisPlugin> plugins;

    AnalysisExecutionOptions(Effort effort, int rankThreshold, int confidenceThreshold,
            List<String> includeFilterPaths, List<String> excludeFilterPaths,
            List<String> excludeBaselineBugsPaths, List<AnalysisPlugin> plugins) {
        this.effort = effort;
        this.rankThreshold = rankThreshold;
        this.confidenceThreshold = confidenceThreshold;
        this.includeFilterPaths = List.copyOf(includeFilterPaths);
        this.excludeFilterPaths = List.copyOf(excludeFilterPaths);
        this.excludeBaselineBugsPaths = List.copyOf(excludeBaselineBugsPaths);
        this.plugins = List.copyOf(plugins);
    }

    public Effort getEffort() { return effort; }
    public int getRankThreshold() { return rankThreshold; }
    public int getConfidenceThreshold() { return confidenceThreshold; }
    public List<String> getIncludeFilterPaths() { return includeFilterPaths; }
    public List<String> getExcludeFilterPaths() { return excludeFilterPaths; }
    public List<String> getExcludeBaselineBugsPaths() { return excludeBaselineBugsPaths; }
    public List<AnalysisPlugin> getPlugins() { return plugins; }
    public List<String> getPluginPaths() {
        List<String> paths = new ArrayList<>();
        for (AnalysisPlugin plugin : plugins) paths.add(plugin.getPath());
        return paths;
    }
}
