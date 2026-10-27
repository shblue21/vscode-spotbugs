package com.spotbugs.vscode.runner.internal;

import java.io.IOException;
import java.io.StringWriter;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.function.Supplier;
import java.util.Objects;
import java.util.concurrent.CancellationException;

import com.spotbugs.vscode.runner.internal.config.AnalysisExecutionOptions;
import com.spotbugs.vscode.runner.internal.config.PreferencesApplier;

import com.spotbugs.vscode.runner.api.AnalysisReportSummary;
import com.spotbugs.vscode.runner.api.BugInfo;
import com.spotbugs.vscode.runner.api.CommandWarning;

import org.eclipse.core.runtime.IProgressMonitor;

import edu.umd.cs.findbugs.BugCollectionBugReporter;
import edu.umd.cs.findbugs.BugInstance;
import edu.umd.cs.findbugs.DetectorFactoryCollection;
import edu.umd.cs.findbugs.FindBugs2;
import edu.umd.cs.findbugs.NoOpFindBugsProgress;
import edu.umd.cs.findbugs.Project;
import edu.umd.cs.findbugs.ProjectStats;
import edu.umd.cs.findbugs.SortedBugCollection;
import edu.umd.cs.findbugs.config.UserPreferences;

public class SpotBugsExecutor {

    private final Supplier<FindBugs2> engineFactory;
    private final PluginLifecycle pluginLifecycle;

    public SpotBugsExecutor() {
        this(FindBugs2::new, PluginLifecycle.DEFAULT);
    }

    // A fresh engine is required for each call; the executor owns and closes it.
    SpotBugsExecutor(Supplier<FindBugs2> engineFactory, PluginLifecycle pluginLifecycle) {
        this.engineFactory = Objects.requireNonNull(engineFactory);
        this.pluginLifecycle = Objects.requireNonNull(pluginLifecycle);
    }

    public SpotBugsAnalysisResult execute(PreparedAnalysisInput input, AnalysisExecutionOptions options,
            IProgressMonitor monitor, boolean includeBaselineXml) throws IOException, InterruptedException {
        synchronized (SpotBugsRuntime.LOCK) {
            checkCanceled(monitor);
            SpotBugsRuntime.LoadedPlugins loadedPlugins = null;
            SpotBugsAnalysisResult result;
            try (FindBugs2 findBugs = engineFactory.get()) {
                // FindBugs2.close owns the attached Project, including exceptional exits.
                Project project = new Project();
                findBugs.setProject(project);
                for (String target : input.getTargets()) project.addFile(target);
                project.addSourceDirs(input.getSourcepaths());
                for (String path : input.getAuxClasspaths()) project.addAuxClasspathEntry(path);
                DeferredSarifBugReporter reporter = new DeferredSarifBugReporter(project);
                reporter.setPriorityThreshold(options.getConfidenceThreshold());
                reporter.setRankThreshold(options.getRankThreshold());
                findBugs.setBugReporter(reporter);
                UserPreferences preferences = UserPreferences.createDefaultUserPreferences();
                new PreferencesApplier().apply(preferences, findBugs, options);
                loadedPlugins = SpotBugsRuntime.LoadedPlugins.load(options.getPlugins(), project, pluginLifecycle);
                // Bind filters after plugins are available and the reporter is attached.
                findBugs.setUserPreferences(preferences);
                result = runAndCollect(findBugs, reporter, monitor, includeBaselineXml);
            } catch (IOException | InterruptedException | RuntimeException | Error failure) {
                if (loadedPlugins != null) loadedPlugins.closeAfterFailure(failure);
                throw failure;
            }
            // Reports are detached before the engine closes; plugin classes remain loaded until then.
            List<CommandWarning> warnings = loadedPlugins.closeAfterSuccess();
            warnings.addAll(result.getWarnings());
            return new SpotBugsAnalysisResult(result.getBugs(), warnings, result.getReportSummary(),
                    result.getNativeSarif(), result.getBaselineXml(), result.getMissingClasses());
        }
    }

    private SpotBugsAnalysisResult runAndCollect(FindBugs2 findBugs, DeferredSarifBugReporter defaultBugReporter,
            IProgressMonitor monitor, boolean includeBaselineXml) throws IOException, InterruptedException {
        List<BugInfo> bugs;
        AnalysisReportSummary reportSummary;
        String nativeSarif = null;
        String baselineXml = null;
        CommandWarning sarifWarning = null;
        CommandWarning baselineWarning = null;
        boolean analysisIncomplete;
        List<String> missingClasses = new ArrayList<>();
        execute(findBugs, monitor);
        try {
            nativeSarif = defaultBugReporter.writeSarif();
        } catch (RuntimeException | LinkageError e) {
            sarifWarning = new CommandWarning(
                    "SARIF_REPORT_UNAVAILABLE",
                    "Failed to generate the native SpotBugs SARIF report: " + failureMessage(e)
            );
        }
        bugs = collectBugs(defaultBugReporter);
        reportSummary = collectReportSummary(defaultBugReporter);
        ((SortedBugCollection) defaultBugReporter.getBugCollection())
                .missingClassIterator().forEachRemaining(missingClasses::add);
        analysisIncomplete = !defaultBugReporter.getQueuedErrors().isEmpty() || !missingClasses.isEmpty();
        if (includeBaselineXml && !analysisIncomplete) {
            try {
                checkCanceled(monitor);
                baselineXml = writeBaselineXml(defaultBugReporter.getBugCollection().getCollection());
                checkCanceled(monitor);
            } catch (CancellationException cancellation) {
                throw cancellation;
            } catch (IOException | RuntimeException | LinkageError e) {
                baselineWarning = new CommandWarning(
                        "BASELINE_REPORT_UNAVAILABLE",
                        "Failed to generate the native SpotBugs baseline report: " + failureMessage(e)
                );
            }
        }
        List<CommandWarning> warnings = new ArrayList<>();
        if (sarifWarning != null) {
            warnings.add(sarifWarning);
        }
        if (baselineWarning != null) {
            warnings.add(baselineWarning);
        }
        if (analysisIncomplete) {
            warnings.add(new CommandWarning(
                    "ANALYSIS_INCOMPLETE",
                    "SpotBugs analysis may be incomplete because classes were missing or recoverable errors occurred."
            ));
        }
        return new SpotBugsAnalysisResult(bugs, warnings, reportSummary, nativeSarif, baselineXml,
                missingClasses);
    }

    private static String writeBaselineXml(Collection<BugInstance> source) throws IOException {
        try (Project baselineProject = new Project()) {
            SortedBugCollection baseline = new SortedBugCollection(baselineProject);
            baseline.addAll(source, false);
            baseline.setWithMessages(false);
            baseline.setMinimalXML(true);
            StringWriter writer = new StringWriter();
            baseline.writeXML(writer);
            return writer.toString();
        }
    }

    private void execute(FindBugs2 findBugs, IProgressMonitor monitor)
            throws IOException, InterruptedException {
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

    private List<BugInfo> collectBugs(BugCollectionBugReporter reporter) {
        Collection<BugInstance> bugs = reporter.getBugCollection().getCollection();
        List<BugInfo> bugList = new ArrayList<>();
        for (BugInstance bug : bugs) {
            bugList.add(new BugInfo(bug));
        }
        return bugList;
    }

    private AnalysisReportSummary collectReportSummary(BugCollectionBugReporter reporter) {
        ProjectStats stats = reporter.getBugCollection().getProjectStats();
        return new AnalysisReportSummary(
                stats.getCodeSize(),
                stats.getNumClasses(),
                stats.getPackageStats().size()
        );
    }

    private static String failureMessage(Throwable failure) {
        String message = failure.getMessage();
        return message != null && !message.trim().isEmpty()
                ? message.trim()
                : failure.getClass().getSimpleName();
    }

}
