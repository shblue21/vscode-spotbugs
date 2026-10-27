package com.spotbugs.vscode.runner.internal;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;
import com.spotbugs.vscode.runner.api.DetectorInventoryEntry;
import com.spotbugs.vscode.runner.api.PluginInventoryEntry;
import edu.umd.cs.findbugs.DetectorFactoryCollection;
import edu.umd.cs.findbugs.Plugin;
import edu.umd.cs.findbugs.Project;

public class PluginInventoryService {
    public List<PluginInventoryEntry> inspect(List<String> pluginPaths) {
        List<String> paths = pluginPaths == null ? Collections.emptyList() : pluginPaths;
        synchronized (SpotBugsRuntime.LOCK) {
            SpotBugsRuntime.LoadedPlugins loaded = new SpotBugsRuntime.LoadedPlugins(PluginLifecycle.DEFAULT);
            List<PluginInventoryEntry> entries = new ArrayList<>();
            Project project = new Project();
            try {
                DetectorFactoryCollection.instance();
                for (Plugin plugin : Plugin.getAllPlugins()) {
                    if (plugin.isCorePlugin()) entries.add(entry(-1, "", null, plugin));
                }
                for (int index = 0; index < paths.size(); index++) {
                    String path = paths.get(index);
                    try {
                        Plugin plugin = loaded.load(path, project);
                        entries.add(entry(index, path, new File(path).getCanonicalPath(), plugin));
                    } catch (SpotBugsRuntime.DuplicatePluginIdException failure) {
                        entries.add(new PluginInventoryEntry(index, path, null, "DUPLICATE_PLUGIN_ID",
                                failure.getPluginId(), null, null, null, null, null, null, null, failure.getMessage()));
                    } catch (IOException | RuntimeException | LinkageError failure) {
                        entries.add(new PluginInventoryEntry(index, path, null, "VALIDATION_FAILED",
                                null, null, null, null, null, null, null, null, failure.getMessage()));
                    }
                }
            } catch (RuntimeException | Error failure) {
                loaded.closeAfterFailure(failure);
                throw failure;
            }
            if (!loaded.closeAfterSuccess().isEmpty()) {
                throw new IllegalStateException("Plugin inventory cleanup failed");
            }
            return entries;
        }
    }

    private PluginInventoryEntry entry(int index, String path, String canonical, Plugin plugin) {
        List<String> patterns = plugin.getBugPatterns().stream().map(pattern -> pattern.getType()).sorted().collect(Collectors.toList());
        PluginInventoryEntry entry = new PluginInventoryEntry(index, path, canonical, "VALIDATED", plugin.getPluginId(),
                plugin.getShortDescription(), plugin.getProvider(), plugin.getWebsite(), plugin.getVersion(),
                plugin.getDetectorFactories().size(), patterns.size(), patterns, null);
        entry.setDetectors(plugin.getDetectorFactories().stream().map(DetectorInventoryEntry::new).collect(Collectors.toList()));
        return entry;
    }
}
