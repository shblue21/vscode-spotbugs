package com.spotbugs.vscode.runner.internal.config;

import edu.umd.cs.findbugs.FindBugs2;
import edu.umd.cs.findbugs.config.UserPreferences;

/** Applies AnalysisConfig to SpotBugs user preferences and engine. */
public class PreferencesApplier {

    public void apply(UserPreferences prefs, FindBugs2 engine, AnalysisConfig cfg) {
        if (prefs == null || cfg == null) return;
        // Map effort
        String effortString = toEffortString(cfg.getEffort());
        prefs.setEffort(effortString);

        // TODO: priorityThreshold, excludeFilterPath, plugins can be applied here in future
        // Note: engine configuration (e.g., plugin loading) can also be handled here later.
    }

    private static String toEffortString(Effort e) {
        if (e == null) return "default";
        switch (e) {
            case MIN: return "min";
            case MAX: return "max";
            default: return "default";
        }
    }
}

