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
    private final List<String> classpaths;
    private final Integer priorityThreshold; // optional
    private final String excludeFilterPath;  // optional
    private final List<String> plugins;      // optional

    private AnalysisConfig(Builder b) {
        this.effort = b.effort == null ? Effort.DEFAULT : b.effort;
        this.classpaths = b.classpaths == null
                ? Collections.emptyList()
                : Collections.unmodifiableList(new ArrayList<>(b.classpaths));
        this.priorityThreshold = b.priorityThreshold;
        this.excludeFilterPath = b.excludeFilterPath;
        this.plugins = b.plugins == null
                ? Collections.emptyList()
                : Collections.unmodifiableList(new ArrayList<>(b.plugins));
    }

    public Effort getEffort() { return effort; }
    public List<String> getClasspaths() { return classpaths; }
    public Integer getPriorityThreshold() { return priorityThreshold; }
    public String getExcludeFilterPath() { return excludeFilterPath; }
    public List<String> getPlugins() { return plugins; }

    // Package-private to keep creation within the config pipeline
    static Builder newBuilder() { return new Builder(); }

    static final class Builder {
        private Effort effort;
        private List<String> classpaths;
        private Integer priorityThreshold;
        private String excludeFilterPath;
        private List<String> plugins;

        Builder effort(Effort e) { this.effort = e; return this; }
        Builder classpaths(List<String> cp) { this.classpaths = cp; return this; }
        Builder priorityThreshold(Integer p) { this.priorityThreshold = p; return this; }
        Builder excludeFilterPath(String p) { this.excludeFilterPath = p; return this; }
        Builder plugins(List<String> p) { this.plugins = p; return this; }

        AnalysisConfig build() { return new AnalysisConfig(this); }
    }
}
