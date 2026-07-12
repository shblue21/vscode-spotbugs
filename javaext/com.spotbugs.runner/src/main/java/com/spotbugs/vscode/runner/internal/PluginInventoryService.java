package com.spotbugs.vscode.runner.internal;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.spotbugs.vscode.runner.api.PluginInventoryEntry;

import edu.umd.cs.findbugs.PluginLoader;

public class PluginInventoryService {

    private static final String STATUS_VALIDATED = "VALIDATED";
    private static final String STATUS_DUPLICATE_PLUGIN_ID = "DUPLICATE_PLUGIN_ID";
    private static final String STATUS_VALIDATION_FAILED = "VALIDATION_FAILED";

    public List<PluginInventoryEntry> inspect(List<String> pluginPaths) {
        List<String> paths = pluginPaths != null ? pluginPaths : java.util.Collections.emptyList();
        Map<String, Integer> firstIndexByPluginId = new HashMap<>();
        Set<String> canonicalPaths = new HashSet<>();
        List<PluginInventoryEntry> entries = new ArrayList<>();

        for (int index = 0; index < paths.size(); index++) {
            entries.add(inspectOne(index, paths.get(index), firstIndexByPluginId, canonicalPaths));
        }
        return entries;
    }

    private PluginInventoryEntry inspectOne(
            int index,
            String configuredPath,
            Map<String, Integer> firstIndexByPluginId,
            Set<String> canonicalPaths
    ) {
        String path = configuredPath != null ? configuredPath : "";
        if (path.trim().isEmpty()) {
            return failed(index, path, null, "Plugin path is empty.");
        }

        File canonicalFile;
        try {
            canonicalFile = new File(path).getCanonicalFile();
        } catch (IOException e) {
            return failed(index, path, null, message("Could not resolve plugin path", e));
        }

        String canonicalPath = canonicalFile.getAbsolutePath();
        boolean firstCanonicalPath = canonicalPaths.add(canonicalPath);
        if (!canonicalFile.exists()) {
            return failed(index, path, canonicalPath, "Plugin jar not found: " + canonicalPath);
        }
        if (!canonicalFile.isFile()) {
            return failed(index, path, canonicalPath, "Plugin path is not a file: " + canonicalPath);
        }
        if (!canonicalFile.getName().endsWith(".jar")) {
            return failed(index, path, canonicalPath, "Plugin path is not a jar file: " + canonicalPath);
        }

        PluginLoader.Summary summary;
        try {
            synchronized (PluginLoader.class) {
                summary = PluginLoader.validate(canonicalFile);
            }
        } catch (Exception e) {
            return failed(index, path, canonicalPath, message("Plugin jar failed validation", e));
        }

        String pluginId = trimToNull(summary != null ? summary.id : null);
        if (pluginId != null && firstCanonicalPath) {
            Integer duplicateIndex = firstIndexByPluginId.get(pluginId);
            if (duplicateIndex != null) {
                return new PluginInventoryEntry(
                        index,
                        path,
                        canonicalPath,
                        STATUS_DUPLICATE_PLUGIN_ID,
                        pluginId,
                        "Duplicate plugin id: " + pluginId
                );
            }
            firstIndexByPluginId.put(pluginId, index);
        }

        return new PluginInventoryEntry(index, path, canonicalPath, STATUS_VALIDATED, pluginId, null);
    }

    private static PluginInventoryEntry failed(
            int index,
            String path,
            String canonicalPath,
            String message
    ) {
        return new PluginInventoryEntry(index, path, canonicalPath, STATUS_VALIDATION_FAILED, null, message);
    }

    private static String message(String prefix, Exception exception) {
        String detail = exception != null ? exception.getMessage() : null;
        if (detail == null || detail.trim().isEmpty()) {
            detail = exception != null ? exception.getClass().getSimpleName() : "Unknown error";
        }
        return prefix + ": " + detail;
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
