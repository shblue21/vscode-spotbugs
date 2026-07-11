package com.spotbugs.vscode.runner.api;

public final class PluginInventoryEntry {

    private final int index;
    private final String path;
    private final String canonicalPath;
    private final String status;
    private final String pluginId;
    private final String errorMessage;

    public PluginInventoryEntry(
            int index,
            String path,
            String canonicalPath,
            String status,
            String pluginId,
            String errorMessage
    ) {
        this.index = index;
        this.path = path;
        this.canonicalPath = canonicalPath;
        this.status = status;
        this.pluginId = pluginId;
        this.errorMessage = errorMessage;
    }

    public int getIndex() {
        return index;
    }

    public String getPath() {
        return path;
    }

    public String getCanonicalPath() {
        return canonicalPath;
    }

    public String getStatus() {
        return status;
    }

    public String getPluginId() {
        return pluginId;
    }

    public String getErrorMessage() {
        return errorMessage;
    }
}
