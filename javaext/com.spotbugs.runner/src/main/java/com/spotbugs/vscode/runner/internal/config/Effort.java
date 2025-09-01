package com.spotbugs.vscode.runner.internal.config;

/** Effort levels supported by SpotBugs configuration. */
public enum Effort {
    MIN,
    DEFAULT,
    MAX;

    public static Effort fromString(String s) {
        if (s == null) return DEFAULT;
        String v = s.trim().toLowerCase();
        switch (v) {
            case "min": return MIN;
            case "max": return MAX;
            default: return DEFAULT;
        }
    }
}

