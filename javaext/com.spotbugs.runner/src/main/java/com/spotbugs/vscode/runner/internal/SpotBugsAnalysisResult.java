package com.spotbugs.vscode.runner.internal;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import com.spotbugs.vscode.runner.api.AnalysisReportSummary;
import com.spotbugs.vscode.runner.api.BugInfo;
import com.spotbugs.vscode.runner.api.CommandWarning;

public class SpotBugsAnalysisResult {

    private final List<BugInfo> bugs;
    private final List<CommandWarning> warnings;
    private final AnalysisReportSummary reportSummary;
    private final String nativeSarif;

    public SpotBugsAnalysisResult(List<BugInfo> bugs, List<CommandWarning> warnings) {
        this(bugs, warnings, null, null);
    }

    public SpotBugsAnalysisResult(
            List<BugInfo> bugs,
            List<CommandWarning> warnings,
            AnalysisReportSummary reportSummary
    ) {
        this(bugs, warnings, reportSummary, null);
    }

    public SpotBugsAnalysisResult(
            List<BugInfo> bugs,
            List<CommandWarning> warnings,
            AnalysisReportSummary reportSummary,
            String nativeSarif
    ) {
        this.bugs = normalize(bugs);
        this.warnings = normalize(warnings);
        this.reportSummary = reportSummary;
        this.nativeSarif = nativeSarif;
    }

    public List<BugInfo> getBugs() {
        return bugs;
    }

    public List<CommandWarning> getWarnings() {
        return warnings;
    }

    public AnalysisReportSummary getReportSummary() {
        return reportSummary;
    }

    public String getNativeSarif() {
        return nativeSarif;
    }

    public static SpotBugsAnalysisResult empty() {
        return new SpotBugsAnalysisResult(Collections.emptyList(), Collections.emptyList());
    }

    private static <T> List<T> normalize(List<T> values) {
        return values != null ? new ArrayList<>(values) : new ArrayList<>();
    }
}
