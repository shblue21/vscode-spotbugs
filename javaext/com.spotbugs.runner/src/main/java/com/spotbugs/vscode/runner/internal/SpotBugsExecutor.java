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
import java.util.concurrent.CancellationException;

import com.spotbugs.vscode.runner.api.BugInfo;
import com.spotbugs.vscode.runner.api.CommandWarning;

import org.eclipse.core.runtime.IProgressMonitor;

import edu.umd.cs.findbugs.BugCollectionBugReporter;
import edu.umd.cs.findbugs.BugInstance;
import edu.umd.cs.findbugs.BugRanker;
import edu.umd.cs.findbugs.DetectorFactoryCollection;
import edu.umd.cs.findbugs.FindBugs2;
import edu.umd.cs.findbugs.NoOpFindBugsProgress;
import edu.umd.cs.findbugs.Plugin;
import edu.umd.cs.findbugs.PluginException;
import edu.umd.cs.findbugs.PluginLoader;
import edu.umd.cs.findbugs.Priorities;
import edu.umd.cs.findbugs.Project;
import edu.umd.cs.findbugs.config.UserPreferences;
import edu.umd.cs.findbugs.sarif.SarifBugReporter;

public class SpotBugsExecutor {

    private static final Object SPOTBUGS_GLOBAL_LOCK = new Object();

    private final FindBugs2 findBugs;
    private final Project project;
    private final BugCollectionBugReporter defaultBugReporter;
    private final int effectivePriorityThreshold;
    private final int effectiveRankThreshold;
    private final List<String> pluginJars; // optional
    private final PluginLifecycle pluginLifecycle;

    public SpotBugsExecutor(FindBugs2 findBugs, Project project, Integer rankThreshold, List<String> pluginJars) {
        this(findBugs, project, rankThreshold, pluginJars, PluginLifecycle.DEFAULT);
    }

    SpotBugsExecutor(
            FindBugs2 findBugs,
            Project project,
            Integer rankThreshold,
            List<String> pluginJars,
            PluginLifecycle pluginLifecycle
    ) {
        this.findBugs = findBugs;
        this.project = project;
        this.defaultBugReporter = new BugCollectionBugReporter(project);
        this.effectivePriorityThreshold = rankThreshold == null
                ? Priorities.HIGH_PRIORITY
                : Priorities.LOW_PRIORITY;
        this.effectiveRankThreshold = rankThreshold == null
                ? BugRanker.VISIBLE_RANK_MAX
                : Math.max(
                        BugRanker.VISIBLE_RANK_MIN,
                        Math.min(BugRanker.VISIBLE_RANK_MAX, rankThreshold.intValue())
                );
        this.pluginJars = pluginJars;
        this.pluginLifecycle = pluginLifecycle != null ? pluginLifecycle : PluginLifecycle.DEFAULT;
        configureReporter(this.defaultBugReporter);
    }

    public List<BugInfo> executeBugs() throws IOException, InterruptedException {
        return executeBugsWithWarnings(null).getBugs();
    }

    public SpotBugsAnalysisResult executeBugsWithWarnings() throws IOException, InterruptedException {
        return executeBugsWithWarnings(null);
    }

    public SpotBugsAnalysisResult executeBugsWithWarnings(IProgressMonitor monitor)
            throws IOException, InterruptedException {
        synchronized (SPOTBUGS_GLOBAL_LOCK) {
            checkCanceled(monitor);
            LoadedPlugins loadedPlugins = LoadedPlugins.load(pluginJars, project, pluginLifecycle);
            List<BugInfo> bugs;
            try {
                execute(defaultBugReporter, monitor);
                bugs = collectBugs(defaultBugReporter);
            } catch (IOException | InterruptedException | RuntimeException | Error failure) {
                loadedPlugins.closeAfterFailure(failure);
                throw failure;
            }
            List<CommandWarning> warnings = loadedPlugins.closeAfterSuccess();
            return new SpotBugsAnalysisResult(bugs, warnings);
        }
    }

    public String executeNativeSarif() throws IOException, InterruptedException {
        synchronized (SPOTBUGS_GLOBAL_LOCK) {
            LoadedPlugins loadedPlugins = LoadedPlugins.load(pluginJars, project, pluginLifecycle);
            String sarif;
            try {
                StringWriter writer = new StringWriter();
                SarifBugReporter reporter = new SarifBugReporter(project);
                configureReporter(reporter);
                reporter.setWriter(new PrintWriter(writer));
                execute(reporter, null);
                sarif = writer.toString();
            } catch (IOException | InterruptedException | RuntimeException | Error failure) {
                loadedPlugins.closeAfterFailure(failure);
                throw failure;
            }
            loadedPlugins.closeAfterSuccess();
            return sarif;
        }
    }

    private void execute(BugCollectionBugReporter reporter, IProgressMonitor monitor)
            throws IOException, InterruptedException {
        findBugs.setProject(project);
        findBugs.setBugReporter(reporter);
        UserPreferences currentPreferences = findBugs.getUserPreferences();
        if (currentPreferences != null) {
            // Re-apply current preferences so filter wrappers bind to the current bug reporter chain.
            findBugs.setUserPreferences(currentPreferences);
        }
        DetectorFactoryCollection dfc = DetectorFactoryCollection.instance();
        findBugs.setDetectorFactoryCollection(dfc);
        if (monitor == null) {
            findBugs.execute();
            return;
        }

        findBugs.setProgressCallback(new NoOpFindBugsProgress() {
            private void interruptIfCanceled() {
                if (monitor.isCanceled()) {
                    Thread.currentThread().interrupt();
                }
            }

            @Override
            public void finishArchive() {
                interruptIfCanceled();
            }

            @Override
            public void startAnalysis(int numClasses) {
                interruptIfCanceled();
            }

            @Override
            public void finishClass() {
                interruptIfCanceled();
            }
        });
        try {
            findBugs.execute();
            checkCanceled(monitor);
        } finally {
            findBugs.setProgressCallback(new NoOpFindBugsProgress());
        }
    }

    private static void checkCanceled(IProgressMonitor monitor) {
        if (monitor != null && monitor.isCanceled()) {
            Thread.interrupted();
            throw new CancellationException("Command cancelled");
        }
    }

    private void configureReporter(BugCollectionBugReporter reporter) {
        reporter.setPriorityThreshold(this.effectivePriorityThreshold);
        reporter.setRankThreshold(this.effectiveRankThreshold);
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

    private static final class LoadedPlugins {

        private final List<Plugin> loadedPlugins = new ArrayList<>();
        private final PluginLifecycle lifecycle;

        private LoadedPlugins(PluginLifecycle lifecycle) {
            this.lifecycle = lifecycle;
        }

        private static LoadedPlugins load(List<String> pluginJars, Project project, PluginLifecycle lifecycle)
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

        private List<CommandWarning> closeAfterSuccess() {
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

        private void closeAfterFailure(Throwable failure) {
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
