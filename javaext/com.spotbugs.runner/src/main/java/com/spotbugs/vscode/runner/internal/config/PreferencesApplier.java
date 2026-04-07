package com.spotbugs.vscode.runner.internal.config;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import edu.umd.cs.findbugs.FindBugs2;
import edu.umd.cs.findbugs.config.UserPreferences;

/** Applies AnalysisConfig to SpotBugs user preferences and engine. */
public class PreferencesApplier {

    public void apply(UserPreferences prefs, FindBugs2 engine, AnalysisConfig cfg) {
        if (prefs == null || cfg == null) return;
        // Map effort
        String effortString = toEffortString(cfg.getEffort());
        prefs.setEffort(effortString);
        if (engine != null) {
            // FindBugs2 executes whatever is currently stored in AnalysisOptions.
            // Updating UserPreferences alone leaves the engine pinned to DEFAULT_EFFORT.
            engine.setAnalysisFeatureSettings(prefs.getAnalysisFeatureSettings());
        }

        // Filter files are applied by FindBugs2#setUserPreferences via configureFilters.
        prefs.setIncludeFilterFiles(toEnabledPathMap(cfg.getIncludeFilterPaths()));
        prefs.setExcludeFilterFiles(toEnabledPathMap(resolveExcludeFilterPaths(cfg)));
        prefs.setExcludeBugsFiles(toEnabledPathMap(cfg.getExcludeBaselineBugsPaths()));

        // rank threshold is handled via BugReporter in SpotBugsExecutor
        // plugins are loaded via a temporary context ClassLoader in SpotBugsExecutor
    }

    private static String toEffortString(Effort e) {
        if (e == null) return "default";
        switch (e) {
            case MIN: return "min";
            case MAX: return "max";
            default: return "default";
        }
    }

    private static List<String> resolveExcludeFilterPaths(AnalysisConfig cfg) {
        List<String> configured = cfg.getExcludeFilterPaths();
        if (configured != null && !configured.isEmpty()) {
            return configured;
        }
        String legacyPath = normalizePath(cfg.getExcludeFilterPath());
        if (legacyPath == null) {
            return Collections.emptyList();
        }
        return Collections.singletonList(legacyPath);
    }

    private static Map<String, Boolean> toEnabledPathMap(List<String> paths) {
        if (paths == null || paths.isEmpty()) {
            return Collections.emptyMap();
        }
        Map<String, Boolean> files = new LinkedHashMap<>();
        for (String path : paths) {
            String normalized = normalizePath(path);
            if (normalized != null) {
                files.put(normalized, Boolean.TRUE);
            }
        }
        return files.isEmpty() ? Collections.emptyMap() : files;
    }

    private static String normalizePath(String path) {
        if (path == null) {
            return null;
        }
        String trimmed = path.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
