package com.spotbugs.vscode.runner.internal.command;

import com.spotbugs.vscode.runner.api.CommandResponse;
import com.spotbugs.vscode.runner.api.RunAnalysisSummary;
import com.spotbugs.vscode.runner.internal.AnalyzerService;
import com.spotbugs.vscode.runner.internal.AnalysisInput;
import com.spotbugs.vscode.runner.internal.config.AnalysisConfig;

/**
 * Shared execution and response handling for the source and artifact command boundaries.
 */
public final class RunAnalysisAction extends AbstractCommandAction {

    private static final String ERROR_ANALYSIS_FAILED = "ANALYSIS_FAILED";
    private static final String ERROR_ANALYSIS_CANCELLED = "ANALYSIS_CANCELLED";

    private final RunAnalysisRequestParser requestParser;
    private final AnalysisInput.Kind expectedKind;
    private final AnalysisPipeline pipeline;
    private final RunAnalysisStatsBuilder statsBuilder = new RunAnalysisStatsBuilder();

    public RunAnalysisAction(AnalysisInput.Kind expectedKind) {
        this(expectedKind, AnalyzerService::new);
    }

    RunAnalysisAction(AnalysisInput.Kind expectedKind, AnalyzerServiceFactory analyzerFactory) {
        this.expectedKind = java.util.Objects.requireNonNull(expectedKind, "expectedKind");
        this.requestParser = new RunAnalysisRequestParser();
        this.pipeline = new AnalysisPipeline(analyzerFactory);
    }

    @Override
    public String id() {
        return expectedKind == AnalysisInput.Kind.SOURCE
                ? "java.spotbugs.analyzeSources" : "java.spotbugs.analyzeArtifacts";
    }

    @Override
    protected String cancellationErrorCode() {
        return ERROR_ANALYSIS_CANCELLED;
    }

    @Override
    protected boolean shouldCheckCanceledAfterRun() {
        return false;
    }

    @Override
    protected CommandResponse run(ActionContext context) throws Exception {
        RunAnalysisRequest request = requestParser.parse(context);
        for (AnalysisInput input : request.getInputs()) {
            if (input.kind != expectedKind) {
                throw new CommandActionException("INVALID_ARGUMENT",
                        id() + " requires only " + expectedKind.name().toLowerCase(java.util.Locale.ROOT) + " inputs");
            }
        }
        String targetPath = request.getTargetPath();
        AnalysisConfig config = request.getConfig();

        AnalysisPipelineResult pipelineResult = pipeline.run(context.monitor(), request);
        RunAnalysisSummary stats = statsBuilder.build(
                targetPath,
                pipelineResult.getStartMillis(),
                config,
                pipelineResult.getAnalyzer(),
                pipelineResult.getFindingCount()
        );

        if (pipelineResult.getStatus() == AnalysisPipelineResult.Status.CANCELLED) {
            return CommandResponse.error(
                    ERROR_ANALYSIS_CANCELLED,
                    "Command cancelled",
                    stats
            );
        }

        if (pipelineResult.getStatus() == AnalysisPipelineResult.Status.FAILED) {
            return CommandResponse.error(
                    ERROR_ANALYSIS_FAILED,
                    rootCauseMessage(pipelineResult.getFailure()),
                    stats
            );
        }

        return CommandResponse.success(
                pipelineResult.getResults(),
                stats,
                pipelineResult.getReportSummary(),
                pipelineResult.getWarnings(),
                pipelineResult.getNativeSarif(),
                pipelineResult.getBaselineXml()
        );
    }

    private String rootCauseMessage(Throwable throwable) {
        Throwable root = throwable;
        java.util.Set<Throwable> seen = new java.util.HashSet<>();
        while (root != null && root.getCause() != null && !seen.contains(root.getCause())) {
            seen.add(root);
            root = root.getCause();
        }
        if (root == null) {
            return "Unknown error";
        }
        String message = root.getMessage();
        if (message != null && !message.trim().isEmpty()) {
            return message.trim();
        }
        String simpleName = root.getClass().getSimpleName();
        return simpleName != null && !simpleName.trim().isEmpty()
                ? simpleName
                : root.getClass().getName();
    }
}
