package com.spotbugs.vscode.runner.internal.config;

/** Effort levels supported by SpotBugs configuration. */
public enum Effort {
    MIN,
    LESS,
    DEFAULT,
    MAX;

    public static Effort fromString(String s) {
        if (s == null) return DEFAULT;
        String v = s.trim().toLowerCase();
        switch (v) {
            case "min": return MIN;
            case "less": return LESS;
            case "max": return MAX;
            default: return DEFAULT;
        }
    }
}

