package com.spotbugs.vscode.runner.api;

import java.util.List;

public class Config {
    private String effort;
    private String javaHome;
    private String pluginsFile;
    private List<String> classpaths;

    public String getEffort() {
        return effort;
    }

    public String getJavaHome() {
        return javaHome;
    }

    public String getPluginsFile() {
        return pluginsFile;
    }

    public List<String> getClasspaths() {
        return classpaths;
    }

    @Override
    public String toString() {
        return "Config{"
                + "effort='" + effort + "'\"" +
                ", javaHome='" + javaHome + "'\"" +
                ", pluginsFile='" + pluginsFile + "'\"" +
                ", classpaths=" + (classpaths != null ? classpaths.size() + " entries" : "null") +
                '}';
    }
}
