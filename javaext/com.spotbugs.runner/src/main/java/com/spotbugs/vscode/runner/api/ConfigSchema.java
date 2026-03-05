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
    private List<String> sourcepaths;         // optional
    private Integer priorityThreshold;        // optional
    private List<String> includeFilterPaths;  // optional
    private List<String> excludeFilterPaths;  // optional
    private List<String> excludeBaselineBugsPaths; // optional
    private String excludeFilterPath;         // optional legacy field
    private List<String> plugins;             // optional

    public Integer getSchemaVersion() { return schemaVersion; }
    public String getEffort() { return effort; }
    public List<String> getClasspaths() { return classpaths; }
    public List<String> getSourcepaths() { return sourcepaths; }
    public Integer getPriorityThreshold() { return priorityThreshold; }
    public List<String> getIncludeFilterPaths() { return includeFilterPaths; }
    public List<String> getExcludeFilterPaths() { return excludeFilterPaths; }
    public List<String> getExcludeBaselineBugsPaths() { return excludeBaselineBugsPaths; }
    public String getExcludeFilterPath() { return excludeFilterPath; }
    public List<String> getPlugins() { return plugins; }
}
