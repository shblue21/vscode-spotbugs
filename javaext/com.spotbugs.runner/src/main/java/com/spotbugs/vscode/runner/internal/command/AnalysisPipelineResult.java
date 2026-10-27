package com.spotbugs.vscode.runner.internal.command;

import com.spotbugs.vscode.runner.api.AnalysisReportSummary;
import com.spotbugs.vscode.runner.api.BugInfo;
import com.spotbugs.vscode.runner.api.CommandWarning;
import com.spotbugs.vscode.runner.internal.AnalysisPreparationStats;
import com.spotbugs.vscode.runner.internal.SpotBugsAnalysisResult;

final class AnalysisPipelineResult {

    enum Status {
        SUCCESS,
        CANCELLED,
        FAILED
    }

    private final Status status;
    private final AnalysisPreparationStats preparationStats;
    private final long startMillis;
    private final SpotBugsAnalysisResult result;
    private final Throwable failure;

    private AnalysisPipelineResult(
            Status status,
            AnalysisPreparationStats preparationStats,
            long startMillis,
            SpotBugsAnalysisResult result,
            Throwable failure
    ) {
        this.status = status;
        this.preparationStats = preparationStats;
        this.startMillis = startMillis;
        this.result = result != null ? result : SpotBugsAnalysisResult.empty();
        this.failure = failure;
    }

    static AnalysisPipelineResult success(AnalysisPreparationStats preparationStats, long startMillis, SpotBugsAnalysisResult result) {
        return new AnalysisPipelineResult(Status.SUCCESS, preparationStats, startMillis, result, null);
    }

    static AnalysisPipelineResult cancelled(AnalysisPreparationStats preparationStats, long startMillis) {
        return new AnalysisPipelineResult(Status.CANCELLED, preparationStats, startMillis, null, null);
    }

    static AnalysisPipelineResult failed(AnalysisPreparationStats preparationStats, long startMillis, Throwable failure) {
        return new AnalysisPipelineResult(Status.FAILED, preparationStats, startMillis, null, failure);
    }

    Status getStatus() {
        return status;
    }

    AnalysisPreparationStats getPreparationStats() {
        return preparationStats;
    }

    long getStartMillis() {
        return startMillis;
    }

    java.util.List<BugInfo> getResults() {
        return result.getBugs();
    }

    java.util.List<CommandWarning> getWarnings() {
        return result.getWarnings();
    }

    AnalysisReportSummary getReportSummary() {
        return result.getReportSummary();
    }

    String getNativeSarif() {
        return result.getNativeSarif();
    }

    String getBaselineXml() {
        return result.getBaselineXml();
    }

    java.util.List<String> getMissingClasses() {
        return result.getMissingClasses();
    }

    int getFindingCount() {
        return getResults().size();
    }

    Throwable getFailure() {
        return failure;
    }
}
