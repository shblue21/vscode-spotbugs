package com.spotbugs.vscode.runner.internal;

import java.io.File;
import java.io.IOException;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.lang.reflect.Field;
import java.net.URI;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.spotbugs.vscode.runner.api.BugInfo;

import edu.umd.cs.findbugs.BugCollectionBugReporter;
import edu.umd.cs.findbugs.BugInstance;
import edu.umd.cs.findbugs.DetectorFactoryCollection;
import edu.umd.cs.findbugs.FindBugs2;
import edu.umd.cs.findbugs.Plugin;
import edu.umd.cs.findbugs.PluginException;
import edu.umd.cs.findbugs.PluginLoader;
import edu.umd.cs.findbugs.Project;
import edu.umd.cs.findbugs.config.UserPreferences;
import edu.umd.cs.findbugs.sarif.SarifBugReporter;

public class SpotBugsExecutor {

    private static final Object SPOTBUGS_GLOBAL_LOCK = new Object();

    private final FindBugs2 findBugs;
    private final Project project;
    private final BugCollectionBugReporter defaultBugReporter;
    private final Integer reporterPriorityThreshold; // 1..3 (High..Low) or null
    private final List<String> pluginJars; // optional

    public SpotBugsExecutor(FindBugs2 findBugs, Project project, Integer reporterPriorityThreshold, List<String> pluginJars) {
        this.findBugs = findBugs;
        this.project = project;
        this.defaultBugReporter = new BugCollectionBugReporter(project);
        this.reporterPriorityThreshold = reporterPriorityThreshold;
        this.pluginJars = pluginJars;
        // Keep behavior compatible: default to 1 (highest only) if not provided
        this.defaultBugReporter.setPriorityThreshold(
                this.reporterPriorityThreshold != null ? this.reporterPriorityThreshold.intValue() : 1
        );
    }

    public List<BugInfo> executeBugs() throws IOException, InterruptedException {
        synchronized (SPOTBUGS_GLOBAL_LOCK) {
            try (LoadedPlugins ignored = LoadedPlugins.load(pluginJars, project)) {
                execute(defaultBugReporter);
                return collectBugs(defaultBugReporter);
            }
        }
    }

    public String executeNativeSarif() throws IOException, InterruptedException {
        synchronized (SPOTBUGS_GLOBAL_LOCK) {
            try (LoadedPlugins ignored = LoadedPlugins.load(pluginJars, project)) {
                StringWriter writer = new StringWriter();
                SarifBugReporter reporter = new SarifBugReporter(project);
                reporter.setPriorityThreshold(this.reporterPriorityThreshold != null ? this.reporterPriorityThreshold.intValue() : 1);
                reporter.setWriter(new PrintWriter(writer));
                execute(reporter);
                return writer.toString();
            }
        }
    }

    private void execute(BugCollectionBugReporter reporter) throws IOException, InterruptedException {
        findBugs.setProject(project);
        findBugs.setBugReporter(reporter);
        UserPreferences currentPreferences = findBugs.getUserPreferences();
        if (currentPreferences != null) {
            // Re-apply current preferences so filter wrappers bind to the current bug reporter chain.
            findBugs.setUserPreferences(currentPreferences);
        }
        DetectorFactoryCollection dfc = DetectorFactoryCollection.instance();
        findBugs.setDetectorFactoryCollection(dfc);
        findBugs.execute();
    }

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

    private List<BugInfo> collectBugs(BugCollectionBugReporter reporter) {
        Collection<BugInstance> bugs = reporter.getBugCollection().getCollection();
        List<BugInfo> bugList = new ArrayList<>();
        for (BugInstance bug : bugs) {
            bugList.add(new BugInfo(bug));
        }
        return bugList;
    }

    private static final class LoadedPlugins implements AutoCloseable {

        private final List<Plugin> loadedPlugins = new ArrayList<>();

        private static LoadedPlugins load(List<String> pluginJars, Project project) throws IOException {
            LoadedPlugins loaded = new LoadedPlugins();
            try {
                for (File pluginJar : pluginJarFiles(pluginJars)) {
                    loaded.load(pluginJar, project);
                }
                return loaded;
            } catch (IOException | RuntimeException e) {
                loaded.close(e);
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
                Plugin plugin = Plugin.loadCustomPlugin(pluginJar, project);
                if (plugin != null) {
                    loadedPlugins.add(plugin);
                }
            } catch (PluginException e) {
                IOException failure = new IOException("Failed to load SpotBugs plugin jar " + pluginJar.getPath(), e);
                cleanupAfterFailedLoad(stateBeforeLoad, failure);
                throw failure;
            } catch (RuntimeException e) {
                cleanupAfterFailedLoad(stateBeforeLoad, e);
                throw e;
            }
        }

        @Override
        public void close() {
            close(null);
        }

        private void close(Throwable failure) {
            boolean resetDetectorFactories = !loadedPlugins.isEmpty();
            RuntimeException closeFailure = null;
            try {
                for (int i = loadedPlugins.size() - 1; i >= 0; i--) {
                    Plugin plugin = loadedPlugins.get(i);
                    try {
                        Plugin.removeCustomPlugin(plugin);
                    } catch (RuntimeException e) {
                        if (failure != null) {
                            failure.addSuppressed(e);
                        } else if (closeFailure == null) {
                            closeFailure = e;
                        } else {
                            closeFailure.addSuppressed(e);
                        }
                    } finally {
                        closePlugin(plugin, failure != null ? failure : closeFailure);
                    }
                }
            } finally {
                if (resetDetectorFactories) {
                    DetectorFactoryCollection.resetInstance(null);
                }
            }
            if (failure == null && closeFailure != null) {
                throw closeFailure;
            }
        }

        private static void cleanupAfterFailedLoad(SpotBugsPluginState stateBeforeLoad, Throwable failure) {
            for (Map.Entry<URI, Plugin> entry : Plugin.getAllPluginsMap().entrySet()) {
                if (!stateBeforeLoad.hasPluginUri(entry.getKey())) {
                    Plugin plugin = entry.getValue();
                    try {
                        Plugin.removeCustomPlugin(plugin);
                    } catch (RuntimeException e) {
                        failure.addSuppressed(e);
                    } finally {
                        closePlugin(plugin, failure);
                    }
                }
            }
            stateBeforeLoad.restoreLoadedPluginIds(failure);
            DetectorFactoryCollection.resetInstance(null);
        }

        private static void closePlugin(Plugin plugin, Throwable failure) {
            try {
                plugin.close();
            } catch (IOException e) {
                if (failure != null) {
                    failure.addSuppressed(e);
                }
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
