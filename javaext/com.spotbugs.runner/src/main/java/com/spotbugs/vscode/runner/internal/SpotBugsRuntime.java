package com.spotbugs.vscode.runner.internal;

import java.io.File;
import java.io.IOException;
import java.lang.reflect.Field;
import java.net.URI;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import com.spotbugs.vscode.runner.api.CommandWarning;
import edu.umd.cs.findbugs.DetectorFactoryCollection;
import edu.umd.cs.findbugs.Plugin;
import edu.umd.cs.findbugs.PluginException;
import edu.umd.cs.findbugs.PluginLoader;
import edu.umd.cs.findbugs.Project;

final class SpotBugsRuntime {
    static final Object LOCK = new Object();
    private static List<File> pluginJarFiles(List<String> jars) throws IOException {
        List<File> files = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        if (jars == null || jars.isEmpty()) {
            return files;
        }
        for (String p : jars) {
            if (p == null) {
                continue;
            }
            String path = p.trim();
            if (path.isEmpty()) {
                continue;
            }
            File f = new File(path).getCanonicalFile();
            if (!f.isFile()) {
                throw new IOException("SpotBugs plugin jar does not exist or is not a file: " + path);
            }
            if (seen.add(f.toURI().toString())) {
                files.add(f);
            }
        }
        return files;
    }

    static final class LoadedPlugins {

        private final List<Plugin> loadedPlugins = new ArrayList<>();
        private final PluginLifecycle lifecycle;

        private LoadedPlugins(PluginLifecycle lifecycle) {
            this.lifecycle = lifecycle;
        }

        static LoadedPlugins load(List<String> pluginJars, Project project, PluginLifecycle lifecycle)
                throws IOException {
            LoadedPlugins loaded = new LoadedPlugins(lifecycle);
            try {
                for (File pluginJar : pluginJarFiles(pluginJars)) {
                    loaded.load(pluginJar, project);
                }
                return loaded;
            } catch (IOException | RuntimeException e) {
                loaded.closeAfterFailure(e);
                throw e;
            }
        }

        private void load(File pluginJar, Project project) throws IOException {
            SpotBugsPluginState stateBeforeLoad = SpotBugsPluginState.snapshot();
            Plugin existing = stateBeforeLoad.pluginByUri(pluginJar.toURI());
            if (existing != null) {
                if (project != null) {
                    project.setPluginStatusTrinary(existing.getPluginId(), Boolean.TRUE);
                }
                return;
            }

            try {
                Plugin plugin = lifecycle.loadCustomPlugin(pluginJar, project);
                if (plugin != null) {
                    loadedPlugins.add(plugin);
                }
            } catch (PluginException | LinkageError e) {
                IOException failure = new IOException("Failed to load SpotBugs plugin jar " + pluginJar.getPath(), e);
                cleanupAfterFailedLoad(stateBeforeLoad, failure);
                throw failure;
            } catch (RuntimeException e) {
                cleanupAfterFailedLoad(stateBeforeLoad, e);
                throw e;
            }
        }

        List<CommandWarning> closeAfterSuccess() {
            boolean resetDetectorFactories = !loadedPlugins.isEmpty();
            RuntimeException terminalFailure = null;
            List<CloseFailure> closeFailures = new ArrayList<>();
            try {
                for (int i = loadedPlugins.size() - 1; i >= 0; i--) {
                    Plugin plugin = loadedPlugins.get(i);
                    RuntimeException removeFailure = null;
                    try {
                        lifecycle.removeCustomPlugin(plugin);
                    } catch (RuntimeException e) {
                        removeFailure = e;
                        if (terminalFailure == null) {
                            terminalFailure = e;
                            addSuppressed(terminalFailure, closeFailures);
                        } else {
                            terminalFailure.addSuppressed(e);
                        }
                    } finally {
                        try {
                            lifecycle.closePlugin(plugin);
                        } catch (IOException e) {
                            if (removeFailure != null) {
                                removeFailure.addSuppressed(e);
                            } else if (terminalFailure != null) {
                                terminalFailure.addSuppressed(e);
                            } else {
                                closeFailures.add(new CloseFailure(plugin, e));
                            }
                        }
                    }
                }
            } finally {
                if (resetDetectorFactories) {
                    DetectorFactoryCollection.resetInstance(null);
                }
            }
            if (terminalFailure != null) {
                throw terminalFailure;
            }
            List<CommandWarning> warnings = new ArrayList<>();
            for (CloseFailure closeFailure : closeFailures) {
                warnings.add(closeWarning(closeFailure.plugin, closeFailure.failure));
            }
            return warnings;
        }

        void closeAfterFailure(Throwable failure) {
            boolean resetDetectorFactories = !loadedPlugins.isEmpty();
            try {
                for (int i = loadedPlugins.size() - 1; i >= 0; i--) {
                    removeAndClose(loadedPlugins.get(i), failure);
                }
            } finally {
                if (resetDetectorFactories) {
                    DetectorFactoryCollection.resetInstance(null);
                }
            }
        }

        private void cleanupAfterFailedLoad(SpotBugsPluginState stateBeforeLoad, Throwable failure) {
            for (Map.Entry<URI, Plugin> entry : Plugin.getAllPluginsMap().entrySet()) {
                if (!stateBeforeLoad.hasPluginUri(entry.getKey())) {
                    removeAndClose(entry.getValue(), failure);
                }
            }
            stateBeforeLoad.restoreLoadedPluginIds(failure);
            DetectorFactoryCollection.resetInstance(null);
        }

        private void removeAndClose(Plugin plugin, Throwable failure) {
            try {
                lifecycle.removeCustomPlugin(plugin);
            } catch (RuntimeException e) {
                failure.addSuppressed(e);
            } finally {
                closePlugin(plugin, failure);
            }
        }

        private void closePlugin(Plugin plugin, Throwable failure) {
            try {
                lifecycle.closePlugin(plugin);
            } catch (IOException e) {
                if (failure != null) {
                    failure.addSuppressed(e);
                }
            }
        }

        private static CommandWarning closeWarning(Plugin plugin, IOException failure) {
            String pluginId = pluginId(plugin);
            String detail = failure.getMessage();
            if (detail == null || detail.trim().isEmpty()) {
                detail = failure.getClass().getName();
            } else {
                detail = detail.trim();
            }
            String pluginLabel = pluginId != null && !pluginId.trim().isEmpty()
                    ? " plugin " + pluginId.trim()
                    : " plugin";
            return new CommandWarning(
                    "PLUGIN_CLEANUP_CLOSE_FAILED",
                    "Failed to close SpotBugs" + pluginLabel + ": " + detail
            );
        }

        private static String pluginId(Plugin plugin) {
            try {
                return plugin != null ? plugin.getPluginId() : null;
            } catch (RuntimeException e) {
                return null;
            }
        }

        private static void addSuppressed(Throwable failure, List<CloseFailure> closeFailures) {
            for (CloseFailure closeFailure : closeFailures) {
                failure.addSuppressed(closeFailure.failure);
            }
        }

        private static final class CloseFailure {

            private final Plugin plugin;
            private final IOException failure;

            private CloseFailure(Plugin plugin, IOException failure) {
                this.plugin = plugin;
                this.failure = failure;
            }
        }
    }

    private static final class SpotBugsPluginState {

        private final Map<URI, Plugin> pluginsByUri;
        private final Set<String> loadedPluginIds;

        private SpotBugsPluginState(Map<URI, Plugin> pluginsByUri, Set<String> loadedPluginIds) {
            this.pluginsByUri = pluginsByUri;
            this.loadedPluginIds = loadedPluginIds;
        }

        private static SpotBugsPluginState snapshot() throws IOException {
            return new SpotBugsPluginState(Plugin.getAllPluginsMap(), copyLoadedPluginIds());
        }

        private Plugin pluginByUri(URI uri) {
            return pluginsByUri.get(uri);
        }

        private boolean hasPluginUri(URI uri) {
            return pluginsByUri.containsKey(uri);
        }

        private void restoreLoadedPluginIds(Throwable failure) {
            try {
                loadedPluginIds().retainAll(loadedPluginIds);
            } catch (ReflectiveOperationException | RuntimeException e) {
                failure.addSuppressed(e);
            }
        }

        private static Set<String> copyLoadedPluginIds() throws IOException {
            try {
                return new HashSet<>(loadedPluginIds());
            } catch (ReflectiveOperationException | RuntimeException e) {
                throw new IOException("Unable to inspect SpotBugs plugin id registry", e);
            }
        }

        @SuppressWarnings("unchecked")
        private static Set<String> loadedPluginIds() throws ReflectiveOperationException {
            Field field = PluginLoader.class.getDeclaredField("loadedPluginIds");
            field.setAccessible(true);
            Object value = field.get(null);
            if (!(value instanceof Set)) {
                throw new IllegalStateException("SpotBugs plugin id registry is not a Set");
            }
            return (Set<String>) value;
        }
    }
}
