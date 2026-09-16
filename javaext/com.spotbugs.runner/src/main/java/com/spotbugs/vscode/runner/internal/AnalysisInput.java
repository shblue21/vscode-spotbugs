package com.spotbugs.vscode.runner.internal;

public final class AnalysisInput {
    public enum Kind { SOURCE, ARTIFACT }
    public final Kind kind;
    public final String path;

    public AnalysisInput(Kind kind, String path) {
        if (kind == null || path == null || path.trim().isEmpty()) throw new IllegalArgumentException("Analysis input requires kind and path");
        this.kind = kind;
        this.path = path;
    }
}
