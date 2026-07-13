package com.spotbugs.vscode.runner.api;

public final class PluginInventoryEntry {

    private final int index;
    private final String path;
    private final String canonicalPath;
    private final String status;
    private final String pluginId;
    private final String shortDescription;
    private final String provider;
    private final String website;
    private final String version;
    private final Integer detectorCount;
    private final Integer bugPatternCount;
    private final String errorMessage;

    public PluginInventoryEntry(
            int index,
            String path,
            String canonicalPath,
            String status,
            String pluginId,
            String shortDescription,
            String provider,
            String website,
            String version,
            Integer detectorCount,
            Integer bugPatternCount,
            String errorMessage
    ) {
        this.index = index;
        this.path = path;
        this.canonicalPath = canonicalPath;
        this.status = status;
        this.pluginId = pluginId;
        this.shortDescription = shortDescription;
        this.provider = provider;
        this.website = website;
        this.version = version;
        this.detectorCount = detectorCount;
        this.bugPatternCount = bugPatternCount;
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

    public String getShortDescription() {
        return shortDescription;
    }

    public String getProvider() {
        return provider;
    }

    public String getWebsite() {
        return website;
    }

    public String getVersion() {
        return version;
    }

    public Integer getDetectorCount() {
        return detectorCount;
    }

    public Integer getBugPatternCount() {
        return bugPatternCount;
    }

    public String getErrorMessage() {
        return errorMessage;
    }
}
