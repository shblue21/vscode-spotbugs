package com.spotbugs.vscode.runner.api;

public class Config {
    private String effort;
    private String javaHome;
    private String pluginsFile;

    public String getEffort() {
        return effort;
    }

    public String getJavaHome() {
        return javaHome;
    }

    public String getPluginsFile() {
        return pluginsFile;
    }

    @Override
    public String toString() {
        return "Config{"
                + "effort='" + effort + "'\"" +
                ", javaHome='" + javaHome + "'\"" +
                ", pluginsFile='" + pluginsFile + "'\"" +
                '}';
    }
}
