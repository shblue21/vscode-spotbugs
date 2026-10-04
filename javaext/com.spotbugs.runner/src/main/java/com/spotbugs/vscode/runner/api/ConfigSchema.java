package com.spotbugs.vscode.runner.api;

import java.util.List;
import java.util.Map;

/**
 * Wire/JSON configuration schema. Mirrors user-provided fields and is parsed
 * directly from JSON at the command boundary. Use with a validator/mapper to
 * produce the domain {@code AnalysisConfig}.
 */
public class ConfigSchema {
    private Integer schemaVersion;            // optional, for future growth
    private String effort;                    // "min" | "default" | "max"
    private List<String> targetResolutionRoots; // optional
    private List<String> runtimeClasspaths;   // optional
    private List<String> extraAuxClasspaths;  // optional
    private List<String> sourcepaths;         // optional
    private Map<String, String> sourceOutputs; // optional source-to-output mapping
    private String minimumConfidence;
    private Integer priorityThreshold;        // optional
    private List<String> includeFilterPaths;  // optional
    private List<String> excludeFilterPaths;  // optional
    private List<String> excludeBaselineBugsPaths; // optional
    private List<String> plugins;             // optional
    private Boolean includeBaselineXml;       // optional command output

    public Integer getSchemaVersion() { return schemaVersion; }
    public String getEffort() { return effort; }
    public List<String> getTargetResolutionRoots() { return targetResolutionRoots; }
    public List<String> getRuntimeClasspaths() { return runtimeClasspaths; }
    public List<String> getExtraAuxClasspaths() { return extraAuxClasspaths; }
    public List<String> getSourcepaths() { return sourcepaths; }
    public Map<String, String> getSourceOutputs() { return sourceOutputs; }
    public String getMinimumConfidence() { return minimumConfidence; }
    public Integer getPriorityThreshold() { return priorityThreshold; }
    public List<String> getIncludeFilterPaths() { return includeFilterPaths; }
    public List<String> getExcludeFilterPaths() { return excludeFilterPaths; }
    public List<String> getExcludeBaselineBugsPaths() { return excludeBaselineBugsPaths; }
    public List<String> getPlugins() { return plugins; }
    public Boolean getIncludeBaselineXml() { return includeBaselineXml; }
}
