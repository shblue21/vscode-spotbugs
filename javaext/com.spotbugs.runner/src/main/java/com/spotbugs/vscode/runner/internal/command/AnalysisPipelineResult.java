package com.spotbugs.vscode.runner.internal.command;

import java.util.List;

import com.spotbugs.vscode.runner.api.BugInfo;
import com.spotbugs.vscode.runner.internal.AnalyzerService;

final class AnalysisPipelineResult {

    enum Status {
        SUCCESS,
        CANCELLED,
        FAILED
    }

    private final Status status;
    private final AnalyzerService analyzer;
    private final long startMillis;
    private final List<BugInfo> results;
    private final Throwable failure;

    private AnalysisPipelineResult(
            Status status,
            AnalyzerService analyzer,
            long startMillis,
            List<BugInfo> results,
            Throwable failure
    ) {
        this.status = status;
        this.analyzer = analyzer;
        this.startMillis = startMillis;
        this.results = results != null ? results : java.util.Collections.emptyList();
        this.failure = failure;
    }

    static AnalysisPipelineResult success(AnalyzerService analyzer, long startMillis, List<BugInfo> results) {
        return new AnalysisPipelineResult(Status.SUCCESS, analyzer, startMillis, results, null);
    }

    static AnalysisPipelineResult cancelled(AnalyzerService analyzer, long startMillis) {
        return new AnalysisPipelineResult(
                Status.CANCELLED,
                analyzer,
                startMillis,
                java.util.Collections.emptyList(),
                null
        );
    }

    static AnalysisPipelineResult failed(AnalyzerService analyzer, long startMillis, Throwable failure) {
        return new AnalysisPipelineResult(
                Status.FAILED,
                analyzer,
                startMillis,
                java.util.Collections.emptyList(),
                failure
        );
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

    List<BugInfo> getResults() {
        return results;
    }

    int getFindingCount() {
        return results.size();
    }

    Throwable getFailure() {
        return failure;
    }
}
