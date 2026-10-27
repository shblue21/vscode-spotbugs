package com.spotbugs.vscode.runner.internal.config;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Domain configuration used by the analyzer. This type is independent from
 * the wire/JSON schema and is safe to evolve over time.
 */
public final class AnalysisConfig {

    private final AnalysisExecutionOptions executionOptions;

    private final List<String> targetResolutionRoots;
    private final List<String> runtimeClasspaths;
    private final List<String> extraAuxClasspaths;
    private final List<String> sourcepaths;
    private final Map<String, String> sourceOutputs;

    private AnalysisConfig(Builder b) {
        this.executionOptions = java.util.Objects.requireNonNull(b.executionOptions);
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
        this.sourceOutputs = b.sourceOutputs == null
                ? Collections.emptyMap()
                : Collections.unmodifiableMap(new LinkedHashMap<>(b.sourceOutputs));
    }

    public List<String> getTargetResolutionRoots() { return targetResolutionRoots; }
    public List<String> getRuntimeClasspaths() { return runtimeClasspaths; }
    public List<String> getExtraAuxClasspaths() { return extraAuxClasspaths; }
    public List<String> getSourcepaths() { return sourcepaths; }
    public Map<String, String> getSourceOutputs() { return sourceOutputs; }

    public AnalysisExecutionOptions getExecutionOptions() { return executionOptions; }

    // Package-private to keep creation within the config pipeline
    static Builder newBuilder() { return new Builder(); }

    static final class Builder {
        private AnalysisExecutionOptions executionOptions;
        Builder executionOptions(AnalysisExecutionOptions value) { this.executionOptions = value; return this; }
        private List<String> targetResolutionRoots;
        private List<String> runtimeClasspaths;
        private List<String> extraAuxClasspaths;
        private List<String> sourcepaths;
        private Map<String, String> sourceOutputs;

        Builder targetResolutionRoots(List<String> roots) { this.targetResolutionRoots = roots; return this; }
        Builder runtimeClasspaths(List<String> cp) { this.runtimeClasspaths = cp; return this; }
        Builder extraAuxClasspaths(List<String> cp) { this.extraAuxClasspaths = cp; return this; }
        Builder sourcepaths(List<String> sp) { this.sourcepaths = sp; return this; }
        Builder sourceOutputs(Map<String, String> outputs) { this.sourceOutputs = outputs; return this; }

        AnalysisConfig build() { return new AnalysisConfig(this); }
    }
}
