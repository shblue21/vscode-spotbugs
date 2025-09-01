package com.spotbugs.vscode.runner.internal.config;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import com.spotbugs.vscode.runner.api.ConfigSchema;

/** Validates a wire schema and maps to a domain AnalysisConfig. */
public class ConfigValidator {

    public ConfigValidationResult validate(ConfigSchema schema) {
        if (schema == null) {
            return ConfigValidationResult.error("CFG_BAD_JSON", "Missing configuration");
        }

        // Effort normalization (default on unknown)
        Effort effort = Effort.fromString(schema.getEffort());

        // Classpaths: drop null/empty and dedupe while preserving order
        List<String> cps = normalizeList(schema.getClasspaths());

        // Optional fields: normalize empties to null
        Integer priorityThreshold = schema.getPriorityThreshold();
        String excludeFilterPath = normalizeString(schema.getExcludeFilterPath());
        List<String> plugins = normalizeList(schema.getPlugins());

        AnalysisConfig cfg = AnalysisConfig
            .newBuilder()
            .effort(effort)
            .classpaths(cps)
            .priorityThreshold(priorityThreshold)
            .excludeFilterPath(excludeFilterPath)
            .plugins(plugins)
            .build();

        return ConfigValidationResult.ok(cfg);
    }

    private static String normalizeString(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
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
}

