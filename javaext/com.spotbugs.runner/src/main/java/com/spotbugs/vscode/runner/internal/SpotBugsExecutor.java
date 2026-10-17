package com.spotbugs.vscode.runner.internal;

import java.io.IOException;
import java.io.StringWriter;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.concurrent.CancellationException;

import com.spotbugs.vscode.runner.api.AnalysisReportSummary;
import com.spotbugs.vscode.runner.api.BugInfo;
import com.spotbugs.vscode.runner.api.CommandWarning;

import org.eclipse.core.runtime.IProgressMonitor;

import edu.umd.cs.findbugs.BugCollectionBugReporter;
import edu.umd.cs.findbugs.BugInstance;
import edu.umd.cs.findbugs.BugRanker;
import edu.umd.cs.findbugs.DetectorFactoryCollection;
import edu.umd.cs.findbugs.FindBugs2;
import edu.umd.cs.findbugs.NoOpFindBugsProgress;
import edu.umd.cs.findbugs.Project;
import edu.umd.cs.findbugs.ProjectStats;
import edu.umd.cs.findbugs.SortedBugCollection;
import edu.umd.cs.findbugs.config.UserPreferences;

public class SpotBugsExecutor {

    private final FindBugs2 findBugs;
    private final Project project;
    private final DeferredSarifBugReporter defaultBugReporter;
    private final int effectivePriorityThreshold;
    private final int effectiveRankThreshold;
    private final List<String> pluginJars; // optional
    private final PluginLifecycle pluginLifecycle;

    public SpotBugsExecutor(FindBugs2 findBugs, Project project, Integer rankThreshold, int confidenceThreshold, List<String> pluginJars) {
        this(findBugs, project, rankThreshold, confidenceThreshold, pluginJars, PluginLifecycle.DEFAULT);
    }

    SpotBugsExecutor(
            FindBugs2 findBugs,
            Project project,
            Integer rankThreshold,
            int confidenceThreshold,
            List<String> pluginJars,
            PluginLifecycle pluginLifecycle
    ) {
        this.findBugs = findBugs;
        this.project = project;
        this.defaultBugReporter = new DeferredSarifBugReporter(project);
        this.effectivePriorityThreshold = confidenceThreshold;
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
        return executeBugsWithWarnings(null, false).getBugs();
    }

    public SpotBugsAnalysisResult executeBugsWithWarnings() throws IOException, InterruptedException {
        return executeBugsWithWarnings(null, false);
    }

    public SpotBugsAnalysisResult executeBugsWithWarnings(
            IProgressMonitor monitor,
            boolean includeBaselineXml
    ) throws IOException, InterruptedException {
        synchronized (SpotBugsRuntime.LOCK) {
            checkCanceled(monitor);
            SpotBugsRuntime.LoadedPlugins loadedPlugins = SpotBugsRuntime.LoadedPlugins.load(pluginJars, project, pluginLifecycle);
            List<BugInfo> bugs;
            AnalysisReportSummary reportSummary;
            String nativeSarif = null;
            String baselineXml = null;
            CommandWarning sarifWarning = null;
            CommandWarning baselineWarning = null;
            boolean analysisIncomplete;
            List<String> missingClasses = new ArrayList<>();
            try {
                execute(defaultBugReporter, monitor);
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
            } catch (IOException | InterruptedException | RuntimeException | Error failure) {
                loadedPlugins.closeAfterFailure(failure);
                throw failure;
            }
            List<CommandWarning> warnings = loadedPlugins.closeAfterSuccess();
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
    }

    private static String writeBaselineXml(Collection<BugInstance> source) throws IOException {
        SortedBugCollection baseline = new SortedBugCollection(new Project());
        baseline.addAll(source, false);
        baseline.setWithMessages(false);
        baseline.setMinimalXML(true);
        StringWriter writer = new StringWriter();
        baseline.writeXML(writer);
        return writer.toString();
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
