package com.spotbugs.vscode.runner.api;

import java.util.List;

/**
 * Wire/JSON configuration schema. Mirrors user-provided fields and is parsed
 * directly from JSON at the command boundary. Use with a validator/mapper to
 * produce the domain {@code AnalysisConfig}.
 */
public class ConfigSchema {
    private Integer schemaVersion;            // optional, for future growth
    private String effort;                    // "min" | "default" | "max"
    private List<String> classpaths;          // optional
    private Integer priorityThreshold;        // optional
    private String excludeFilterPath;         // optional
    private List<String> plugins;             // optional

    public Integer getSchemaVersion() { return schemaVersion; }
    public String getEffort() { return effort; }
    public List<String> getClasspaths() { return classpaths; }
    public Integer getPriorityThreshold() { return priorityThreshold; }
    public String getExcludeFilterPath() { return excludeFilterPath; }
    public List<String> getPlugins() { return plugins; }
}

