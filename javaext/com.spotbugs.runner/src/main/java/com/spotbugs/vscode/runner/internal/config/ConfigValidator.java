package com.spotbugs.vscode.runner.internal.config;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

import com.spotbugs.vscode.runner.api.ConfigError;
import com.spotbugs.vscode.runner.api.ConfigSchema;

/** Validates a wire schema and maps to a domain AnalysisConfig. */
public class ConfigValidator {

    public ConfigValidationResult validate(ConfigSchema schema) {
        if (schema == null) {
            return ConfigValidationResult.error("CFG_BAD_JSON", "Missing configuration");
        }

        Integer confidenceThreshold = null;
        String confidence = schema.getMinimumConfidence();
        if (confidence != null) {
            switch (confidence) {
                case "default": break;
                case "high": confidenceThreshold = edu.umd.cs.findbugs.Priorities.HIGH_PRIORITY; break;
                case "medium": confidenceThreshold = edu.umd.cs.findbugs.Priorities.NORMAL_PRIORITY; break;
                case "low": confidenceThreshold = edu.umd.cs.findbugs.Priorities.LOW_PRIORITY; break;
                default: return ConfigValidationResult.error("CFG_CONFIDENCE_INVALID",
                        "minimumConfidence must be default, high, medium, or low");
            }
        }

        // Effort normalization (default on unknown)
        Effort effort = Effort.fromString(schema.getEffort());

        List<String> targetResolutionRoots = normalizeList(schema.getTargetResolutionRoots());
        List<String> runtimeClasspaths = normalizeList(schema.getRuntimeClasspaths());
        List<String> extraAuxClasspaths = normalizeList(schema.getExtraAuxClasspaths());
        List<String> sps = normalizeList(schema.getSourcepaths());
        Map<String, String> sourceOutputs = normalizeMap(schema.getSourceOutputs());

        // Optional fields: normalize empties to null
        Integer priorityThreshold = schema.getPriorityThreshold();
        List<String> includeFilterPaths = normalizeList(schema.getIncludeFilterPaths());
        List<String> excludeFilterPaths = normalizeList(schema.getExcludeFilterPaths());
        List<String> excludeBaselineBugsPaths = normalizeList(schema.getExcludeBaselineBugsPaths());
        List<String> plugins = normalizeList(schema.getPlugins());

        ConfigError includeFilterError = FilterFileValidator.validateIncludeFilters(includeFilterPaths);
        if (includeFilterError != null) {
            return ConfigValidationResult.error(includeFilterError.getCode(), includeFilterError.getMessage());
        }
        ConfigError excludeFilterError = FilterFileValidator.validateExcludeFilters(excludeFilterPaths);
        if (excludeFilterError != null) {
            return ConfigValidationResult.error(excludeFilterError.getCode(), excludeFilterError.getMessage());
        }
        ConfigError baselineFilterError = FilterFileValidator.validateBaselineFilters(excludeBaselineBugsPaths);
        if (baselineFilterError != null) {
            return ConfigValidationResult.error(baselineFilterError.getCode(), baselineFilterError.getMessage());
        }
        ConfigError extraAuxClasspathError = FilterFileValidator.validateExtraAuxClasspaths(extraAuxClasspaths);
        if (extraAuxClasspathError != null) {
            return ConfigValidationResult.error(extraAuxClasspathError.getCode(), extraAuxClasspathError.getMessage());
        }

        AnalysisConfig cfg = AnalysisConfig
            .newBuilder()
            .effort(effort)
            .confidenceThreshold(confidenceThreshold)
            .targetResolutionRoots(targetResolutionRoots)
            .runtimeClasspaths(runtimeClasspaths)
            .extraAuxClasspaths(extraAuxClasspaths)
            .sourcepaths(sps)
            .sourceOutputs(sourceOutputs)
            .priorityThreshold(priorityThreshold)
            .includeFilterPaths(includeFilterPaths)
            .excludeFilterPaths(excludeFilterPaths)
            .excludeBaselineBugsPaths(excludeBaselineBugsPaths)
            .plugins(plugins)
            .build();

        return ConfigValidationResult.ok(cfg);
    }

    private static List<String> normalizeList(List<String> in) {
        if (in == null || in.isEmpty()) return java.util.Collections.emptyList();
        Set<String> set = new LinkedHashSet<>();
        for (String v : in) {
            if (v == null) continue;
            String t = v.trim();
            if (!t.isEmpty()) set.add(t);
        }
        return new ArrayList<>(set);
    }

    private static Map<String, String> normalizeMap(Map<String, String> in) {
        Map<String, String> normalized = new LinkedHashMap<>();
        if (in == null) return normalized;
        for (Map.Entry<String, String> entry : in.entrySet()) {
            if (entry.getKey() == null || entry.getValue() == null) continue;
            String source = entry.getKey().trim();
            String output = entry.getValue().trim();
            if (!source.isEmpty() && !output.isEmpty()) normalized.put(source, output);
        }
        return normalized;
    }
}
