package com.spotbugs.vscode.runner.internal;

import java.io.File;
import java.io.IOException;
import java.lang.reflect.Field;
import java.net.URI;
import java.util.ArrayList;
import java.util.HashSet;
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

    static final class DuplicatePluginIdException extends IOException {
        private static final long serialVersionUID = 1L;
        private final String pluginId;

        DuplicatePluginIdException(String pluginId) {
            super("Duplicate plugin id: " + pluginId);
            this.pluginId = pluginId;
        }

        String getPluginId() {
            return pluginId;
        }
    }

    private static File pluginJarFile(String path) throws IOException {
        if (path == null || path.trim().isEmpty()) throw new IOException("Plugin path is empty");
        File file = new File(path).getCanonicalFile();
        if (!file.isFile()) {
            throw new IOException("SpotBugs plugin jar does not exist or is not a file: " + path);
        }
        return file;
    }

    static final class LoadedPlugins {

        private final PluginLifecycle lifecycle;
        // Preserve insertion order for reverse-order cleanup.
        final Map<String, Plugin> byPath = new java.util.LinkedHashMap<>();

        LoadedPlugins(PluginLifecycle lifecycle) {
            this.lifecycle = lifecycle;
        }

        static LoadedPlugins load(List<String> pluginJars, Project project, PluginLifecycle lifecycle)
                throws IOException {
            LoadedPlugins loaded = new LoadedPlugins(lifecycle);
            try {
                if (pluginJars != null) for (String path : pluginJars) {
                    loaded.load(path, project);
                }
                return loaded;
            } catch (IOException | RuntimeException | Error e) {
                loaded.closeAfterFailure(e);
                throw e;
            }
        }

        Plugin load(String path, Project project) throws IOException {
            File pluginJar = pluginJarFile(path);
            if (byPath.containsKey(pluginJar.getPath())) {
                throw new IOException("Duplicate plugin JAR registration: " + path);
            }
            SpotBugsPluginState stateBeforeLoad = SpotBugsPluginState.snapshot();
            Plugin existing = stateBeforeLoad.pluginByUri(pluginJar.toURI());
            if (existing != null) {
                throw new IOException("Plugin JAR is already loaded: " + pluginJar);
            }
            PluginLoader.Summary summary = PluginLoader.validate(pluginJar);
            for (Plugin plugin : Plugin.getAllPlugins()) {
                if (plugin.getPluginId().equals(summary.id)) {
                    throw new DuplicatePluginIdException(summary.id);
                }
            }

            try {
                Plugin plugin = lifecycle.loadCustomPlugin(pluginJar, project);
                if (plugin != null) {
                    byPath.put(pluginJar.getPath(), plugin);
                }
                return plugin;
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
            List<Plugin> loadedPlugins = new ArrayList<>(byPath.values());
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
            List<Plugin> loadedPlugins = new ArrayList<>(byPath.values());
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
