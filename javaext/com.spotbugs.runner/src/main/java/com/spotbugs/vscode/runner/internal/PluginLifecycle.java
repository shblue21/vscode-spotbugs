package com.spotbugs.vscode.runner.internal;

import java.io.File;
import java.io.IOException;

import edu.umd.cs.findbugs.Plugin;
import edu.umd.cs.findbugs.PluginException;
import edu.umd.cs.findbugs.Project;

interface PluginLifecycle {
    PluginLifecycle DEFAULT = new PluginLifecycle() {
    };

    default Plugin loadCustomPlugin(File pluginJar, Project project) throws PluginException {
        return Plugin.loadCustomPlugin(pluginJar, project);
    }

    default void removeCustomPlugin(Plugin plugin) {
        Plugin.removeCustomPlugin(plugin);
    }

    default void closePlugin(Plugin plugin) throws IOException {
        plugin.close();
    }
}
