package com.spotbugs.vscode.runner.api;

public final class AnalysisPlugin {
    private String path;

    public AnalysisPlugin(String path) {
        this.path = path;
    }
    public String getPath() { return path; }
}
