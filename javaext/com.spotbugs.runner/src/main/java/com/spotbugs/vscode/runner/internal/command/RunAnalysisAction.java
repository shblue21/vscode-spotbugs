package com.spotbugs.vscode.runner.internal.command;

import com.spotbugs.vscode.runner.api.CommandResponse;
import com.spotbugs.vscode.runner.api.RunAnalysisSummary;
import com.spotbugs.vscode.runner.internal.AnalyzerService;
import com.spotbugs.vscode.runner.internal.config.AnalysisConfig;
import com.spotbugs.vscode.runner.internal.config.ConfigParser;
import com.spotbugs.vscode.runner.internal.config.ConfigValidator;

/**
 * Handles the {@code java.spotbugs.run} workspace command by invoking SpotBugs analysis
 * on the requested target path.
 */
public final class RunAnalysisAction extends AbstractCommandAction {

    private static final String COMMAND_ID = "java.spotbugs.run";
    private static final String ERROR_ANALYSIS_FAILED = "ANALYSIS_FAILED";
    private static final String ERROR_ANALYSIS_CANCELLED = "ANALYSIS_CANCELLED";

    private final RunAnalysisRequestParser requestParser;
    private final AnalysisPipeline pipeline;
    private final RunAnalysisStatsBuilder statsBuilder = new RunAnalysisStatsBuilder();

    public RunAnalysisAction() {
        this(new ConfigParser(), new ConfigValidator(), AnalyzerService::new);
    }

    RunAnalysisAction(ConfigParser parser, ConfigValidator validator) {
        this(parser, validator, AnalyzerService::new);
    }

    RunAnalysisAction(AnalyzerServiceFactory analyzerFactory) {
        this(new ConfigParser(), new ConfigValidator(), analyzerFactory);
    }

    RunAnalysisAction(ConfigParser parser, ConfigValidator validator, AnalyzerServiceFactory analyzerFactory) {
        this.requestParser = new RunAnalysisRequestParser(parser, validator);
        this.pipeline = new AnalysisPipeline(analyzerFactory);
    }

    @Override
    public String id() {
        return COMMAND_ID;
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
    protected CommandResult run(ActionContext context) throws Exception {
        RunAnalysisRequest request = requestParser.parse(context);
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
            return success(CommandResponse.error(
                    ERROR_ANALYSIS_CANCELLED,
                    "Command cancelled",
                    stats
            ));
        }

        if (pipelineResult.getStatus() == AnalysisPipelineResult.Status.FAILED) {
            return success(CommandResponse.error(
                    ERROR_ANALYSIS_FAILED,
                    rootCauseMessage(pipelineResult.getFailure()),
                    stats
            ));
        }

        return success(CommandResponse.success(
                pipelineResult.getResults(),
                stats,
                pipelineResult.getReportSummary(),
                pipelineResult.getWarnings(),
                pipelineResult.getNativeSarif()
        ));
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
