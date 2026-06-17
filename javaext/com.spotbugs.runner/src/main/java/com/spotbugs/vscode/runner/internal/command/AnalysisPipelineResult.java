package com.spotbugs.vscode.runner.internal.command;

import com.spotbugs.vscode.runner.api.BugInfo;
import com.spotbugs.vscode.runner.api.CommandWarning;
import com.spotbugs.vscode.runner.internal.AnalyzerService;
import com.spotbugs.vscode.runner.internal.SpotBugsAnalysisResult;

final class AnalysisPipelineResult {

    enum Status {
        SUCCESS,
        CANCELLED,
        FAILED
    }

    private final Status status;
    private final AnalyzerService analyzer;
    private final long startMillis;
    private final SpotBugsAnalysisResult result;
    private final Throwable failure;

    private AnalysisPipelineResult(
            Status status,
            AnalyzerService analyzer,
            long startMillis,
            SpotBugsAnalysisResult result,
            Throwable failure
    ) {
        this.status = status;
        this.analyzer = analyzer;
        this.startMillis = startMillis;
        this.result = result != null ? result : SpotBugsAnalysisResult.empty();
        this.failure = failure;
    }

    static AnalysisPipelineResult success(AnalyzerService analyzer, long startMillis, SpotBugsAnalysisResult result) {
        return new AnalysisPipelineResult(Status.SUCCESS, analyzer, startMillis, result, null);
    }

    static AnalysisPipelineResult cancelled(AnalyzerService analyzer, long startMillis) {
        return new AnalysisPipelineResult(Status.CANCELLED, analyzer, startMillis, null, null);
    }

    static AnalysisPipelineResult failed(AnalyzerService analyzer, long startMillis, Throwable failure) {
        return new AnalysisPipelineResult(Status.FAILED, analyzer, startMillis, null, failure);
    }

    Status getStatus() {
        return status;
    }

    AnalyzerService getAnalyzer() {
        return analyzer;
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

    int getFindingCount() {
        return getResults().size();
    }

    Throwable getFailure() {
        return failure;
    }
}
