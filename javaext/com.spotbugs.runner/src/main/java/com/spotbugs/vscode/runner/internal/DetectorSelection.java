package com.spotbugs.vscode.runner.internal;

import java.io.File;
import java.io.IOException;
import java.util.Map;
import com.spotbugs.vscode.runner.api.AnalysisPlugin;
import com.spotbugs.vscode.runner.internal.config.AnalysisExecutionOptions;
import edu.umd.cs.findbugs.DetectorFactory;
import edu.umd.cs.findbugs.DetectorFactoryCollection;
import edu.umd.cs.findbugs.Plugin;
import edu.umd.cs.findbugs.config.UserPreferences;

final class DetectorSelection {
    static void apply(UserPreferences preferences, AnalysisExecutionOptions options, Map<String, Plugin> byPath) throws IOException {
        DetectorFactoryCollection factories = DetectorFactoryCollection.instance();
        applyOverrides(preferences, options.getDetectors(), factories.getCorePlugin().getDetectorFactories(), factories.getFactories());
        for (AnalysisPlugin selection : options.getPlugins()) {
            Plugin plugin = byPath.get(new File(selection.getPath()).getCanonicalPath());
            if (plugin == null) throw new IOException("Plugin was not loaded: " + selection.getPath());
            applyOverrides(preferences, selection.getDetectors(), plugin.getDetectorFactories(), factories.getFactories());
        }
    }

    static void applyOverrides(UserPreferences preferences, Map<String, Boolean> overrides,
            Iterable<DetectorFactory> owned, Iterable<DetectorFactory> all) throws IOException {
        for (Map.Entry<String, Boolean> override : overrides.entrySet()) {
            DetectorFactory selected = null;
            for (DetectorFactory factory : owned) {
                if (factory.getFullName().equals(override.getKey())) {
                    if (selected != null) throw new IOException("Ambiguous detector: " + override.getKey());
                    selected = factory;
                }
            }
            if (selected == null) throw new IOException("Unknown detector override: " + override.getKey());
            // SpotBugs 4.10.4 stores preferences by short name, even when selection uses FQCN.
            for (DetectorFactory factory : all) {
                if (factory != selected && factory.getShortName().equals(selected.getShortName())) {
                    throw new IOException("Detector override has a colliding SpotBugs short name: " + override.getKey());
                }
            }
            preferences.enableDetector(selected, override.getValue());
        }
    }
}
