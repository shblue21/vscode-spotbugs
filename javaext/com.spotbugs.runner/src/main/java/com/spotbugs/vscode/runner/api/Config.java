package com.spotbugs.vscode.runner.api;

import java.util.List;

public class Config {
    private String effort;
    private List<String> classpaths;

    public String getEffort() {
        return effort;
    }

    public List<String> getClasspaths() {
        return classpaths;
    }

    @Override
    public String toString() {
        return "Config{"
                + "effort='" + effort + "'\"" +
                ", classpaths=" + (classpaths != null ? classpaths.size() + " entries" : "null") +
                '}';
    }
}
