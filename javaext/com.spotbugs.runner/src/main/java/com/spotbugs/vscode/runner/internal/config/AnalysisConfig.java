package com.spotbugs.vscode.runner.internal.config;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Domain configuration used by the analyzer. This type is independent from
 * the wire/JSON schema and is safe to evolve over time.
 */
public class AnalysisConfig {

    private final Effort effort;
    private final List<String> targetResolutionRoots;
    private final List<String> runtimeClasspaths;
    private final List<String> extraAuxClasspaths;
    private final List<String> sourcepaths;
    private final Integer priorityThreshold; // optional
    private final List<String> includeFilterPaths; // optional
    private final List<String> excludeFilterPaths; // optional
    private final List<String> excludeBaselineBugsPaths; // optional
    private final String excludeFilterPath;  // optional legacy field
    private final List<String> plugins;      // optional

    private AnalysisConfig(Builder b) {
        this.effort = b.effort == null ? Effort.DEFAULT : b.effort;
        this.targetResolutionRoots = b.targetResolutionRoots == null
                ? Collections.emptyList()
                : Collections.unmodifiableList(new ArrayList<>(b.targetResolutionRoots));
        this.runtimeClasspaths = b.runtimeClasspaths == null
                ? Collections.emptyList()
                : Collections.unmodifiableList(new ArrayList<>(b.runtimeClasspaths));
        this.extraAuxClasspaths = b.extraAuxClasspaths == null
                ? Collections.emptyList()
                : Collections.unmodifiableList(new ArrayList<>(b.extraAuxClasspaths));
        this.sourcepaths = b.sourcepaths == null
                ? Collections.emptyList()
                : Collections.unmodifiableList(new ArrayList<>(b.sourcepaths));
        this.priorityThreshold = b.priorityThreshold;
        this.includeFilterPaths = b.includeFilterPaths == null
                ? Collections.emptyList()
                : Collections.unmodifiableList(new ArrayList<>(b.includeFilterPaths));
        this.excludeFilterPaths = b.excludeFilterPaths == null
                ? Collections.emptyList()
                : Collections.unmodifiableList(new ArrayList<>(b.excludeFilterPaths));
        this.excludeBaselineBugsPaths = b.excludeBaselineBugsPaths == null
                ? Collections.emptyList()
                : Collections.unmodifiableList(new ArrayList<>(b.excludeBaselineBugsPaths));
        this.excludeFilterPath = b.excludeFilterPath;
        this.plugins = b.plugins == null
                ? Collections.emptyList()
                : Collections.unmodifiableList(new ArrayList<>(b.plugins));
    }

    public Effort getEffort() { return effort; }
    public List<String> getTargetResolutionRoots() { return targetResolutionRoots; }
    public List<String> getRuntimeClasspaths() { return runtimeClasspaths; }
    public List<String> getExtraAuxClasspaths() { return extraAuxClasspaths; }
    public List<String> getSourcepaths() { return sourcepaths; }
    public Integer getPriorityThreshold() { return priorityThreshold; }
    public List<String> getIncludeFilterPaths() { return includeFilterPaths; }
    public List<String> getExcludeFilterPaths() { return excludeFilterPaths; }
    public List<String> getExcludeBaselineBugsPaths() { return excludeBaselineBugsPaths; }
    public String getExcludeFilterPath() { return excludeFilterPath; }
    public List<String> getPlugins() { return plugins; }

    // Package-private to keep creation within the config pipeline
    static Builder newBuilder() { return new Builder(); }

    static final class Builder {
        private Effort effort;
        private List<String> targetResolutionRoots;
        private List<String> runtimeClasspaths;
        private List<String> extraAuxClasspaths;
        private List<String> sourcepaths;
        private Integer priorityThreshold;
        private List<String> includeFilterPaths;
        private List<String> excludeFilterPaths;
        private List<String> excludeBaselineBugsPaths;
        private String excludeFilterPath;
        private List<String> plugins;

        Builder effort(Effort e) { this.effort = e; return this; }
        Builder targetResolutionRoots(List<String> roots) { this.targetResolutionRoots = roots; return this; }
        Builder runtimeClasspaths(List<String> cp) { this.runtimeClasspaths = cp; return this; }
        Builder extraAuxClasspaths(List<String> cp) { this.extraAuxClasspaths = cp; return this; }
        Builder sourcepaths(List<String> sp) { this.sourcepaths = sp; return this; }
        Builder priorityThreshold(Integer p) { this.priorityThreshold = p; return this; }
        Builder includeFilterPaths(List<String> p) { this.includeFilterPaths = p; return this; }
        Builder excludeFilterPaths(List<String> p) { this.excludeFilterPaths = p; return this; }
        Builder excludeBaselineBugsPaths(List<String> p) { this.excludeBaselineBugsPaths = p; return this; }
        Builder excludeFilterPath(String p) { this.excludeFilterPath = p; return this; }
        Builder plugins(List<String> p) { this.plugins = p; return this; }

        AnalysisConfig build() { return new AnalysisConfig(this); }
    }
}
