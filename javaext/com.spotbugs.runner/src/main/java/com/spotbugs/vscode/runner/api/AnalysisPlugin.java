package com.spotbugs.vscode.runner.api;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

public final class AnalysisPlugin {
    private String path;
    private Map<String, Boolean> detectors;

    public AnalysisPlugin(String path, Map<String, Boolean> detectors) {
        this.path = path;
        this.detectors = Collections.unmodifiableMap(new LinkedHashMap<>(detectors));
    }
    public String getPath() { return path; }
    public Map<String, Boolean> getDetectors() {
        return detectors == null ? Collections.emptyMap() : detectors;
    }
}
