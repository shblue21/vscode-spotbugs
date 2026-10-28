package com.spotbugs.vscode.runner.api;

import java.util.Collections;
import java.util.List;

public class CommandResponse {
    private final Object results;
    private final List<CommandError> errors;
    private final List<CommandWarning> warnings;
    private final RunAnalysisSummary stats;
    private final AnalysisReportSummary reportSummary;
    private final String nativeSarif;
    private final String baselineXml;
    private final List<String> missingClasses;

    private CommandResponse(
            Object results,
            List<CommandError> errors,
            List<CommandWarning> warnings,
            RunAnalysisSummary stats,
            AnalysisReportSummary reportSummary,
            String nativeSarif,
            String baselineXml,
            List<String> missingClasses
    ) {
        this.results = results != null ? results : Collections.emptyList();
        this.errors = errors != null ? errors : Collections.emptyList();
        this.warnings = warnings != null && !warnings.isEmpty() ? warnings : null;
        this.stats = stats;
        this.reportSummary = reportSummary;
        this.nativeSarif = nativeSarif;
        this.baselineXml = baselineXml;
        this.missingClasses = missingClasses != null && !missingClasses.isEmpty() ? missingClasses : null;
    }

    public static CommandResponse success(Object results, RunAnalysisSummary stats) {
        return new CommandResponse(results, Collections.emptyList(), null, stats, null, null, null, null);
    }

    public static CommandResponse success(
            Object results,
            RunAnalysisSummary stats,
            AnalysisReportSummary reportSummary,
            List<CommandWarning> warnings,
            String nativeSarif,
            String baselineXml,
            List<String> missingClasses
    ) {
        return new CommandResponse(results, Collections.emptyList(), warnings, stats, reportSummary,
                nativeSarif, baselineXml, missingClasses);
    }

    public static CommandResponse error(String code, String message) {
        return error(code, message, null);
    }

    public static CommandResponse error(String code, String message, RunAnalysisSummary stats) {
        CommandError error = new CommandError(code, message);
        return new CommandResponse(
                Collections.emptyList(), Collections.singletonList(error), null, stats, null, null, null, null);
    }

    public RunAnalysisSummary getStats() {
        return stats;
    }

    public AnalysisReportSummary getReportSummary() {
        return reportSummary;
    }
}
