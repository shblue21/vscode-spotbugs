package com.spotbugs.vscode.runner.internal.command;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.spotbugs.vscode.runner.api.BugInfo;
import com.spotbugs.vscode.runner.api.CommandResponse;
import com.spotbugs.vscode.runner.api.ConfigError;
import com.spotbugs.vscode.runner.api.ConfigSchema;
import com.spotbugs.vscode.runner.internal.AnalyzerService;
import com.spotbugs.vscode.runner.internal.config.AnalysisConfig;
import com.spotbugs.vscode.runner.internal.config.ConfigParseResult;
import com.spotbugs.vscode.runner.internal.config.ConfigParser;
import com.spotbugs.vscode.runner.internal.config.ConfigValidationResult;
import com.spotbugs.vscode.runner.internal.config.ConfigValidator;
import edu.umd.cs.findbugs.Version;

/**
 * Handles the {@code java.spotbugs.run} workspace command by invoking SpotBugs analysis
 * on the requested target path.
 */
public final class RunAnalysisAction extends AbstractCommandAction {

    private static final String COMMAND_ID = "java.spotbugs.run";
    private static final String ERROR_ANALYSIS_FAILED = "ANALYSIS_FAILED";
    private static final String ERROR_ANALYSIS_CANCELLED = "ANALYSIS_CANCELLED";

    private final ConfigParser configParser;
    private final ConfigValidator configValidator;
    private final AnalyzerServiceFactory analyzerFactory;

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
        this.configParser = parser;
        this.configValidator = validator;
        this.analyzerFactory = analyzerFactory != null ? analyzerFactory : AnalyzerService::new;
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
        String targetPath = context.requireStringArg(0, "path");
        String configJson = context.optionalStringArg(1);
        if (configJson == null || configJson.trim().isEmpty()) {
            configJson = "{}";
        }

        AnalysisConfig config = parseAndValidateConfig(configJson);

        AnalyzerService analyzer = analyzerFactory.create();
        analyzer.setConfiguration(config);
        long start = System.currentTimeMillis();
        try {
            List<BugInfo> bugs = analyzer.analyzeToBugs(context.monitor(), targetPath);
            List<BugInfo> results = bugs != null ? bugs : java.util.Collections.emptyList();
            if (context.isCanceled()) {
                Map<String, Object> stats = buildStats(targetPath, start, config, analyzer, 0);
                return success(CommandResponse.error(
                        ERROR_ANALYSIS_CANCELLED,
                        "Command cancelled",
                        stats
                ));
            }
            Map<String, Object> stats = buildStats(targetPath, start, config, analyzer, results.size());
            return success(CommandResponse.success(results, stats));
        } catch (java.util.concurrent.CancellationException cancellation) {
            Map<String, Object> stats = buildStats(targetPath, start, config, analyzer, 0);
            return success(CommandResponse.error(
                    ERROR_ANALYSIS_CANCELLED,
                    "Command cancelled",
                    stats
            ));
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            Map<String, Object> stats = buildStats(targetPath, start, config, analyzer, 0);
            return success(CommandResponse.error(
                    ERROR_ANALYSIS_CANCELLED,
                    "Command cancelled",
                    stats
            ));
        } catch (Exception analysisFailure) {
            Map<String, Object> stats = buildStats(targetPath, start, config, analyzer, 0);
            return success(CommandResponse.error(
                    ERROR_ANALYSIS_FAILED,
                    rootCauseMessage(analysisFailure),
                    stats
            ));
        }
    }

    private Map<String, Object> buildStats(
            String targetPath,
            long startMillis,
            AnalysisConfig config,
            AnalyzerService analyzer,
            int findingCount
    ) {
        long elapsed = System.currentTimeMillis() - startMillis;
        Map<String, Object> stats = new HashMap<>();
        stats.put("target", targetPath);
        stats.put("durationMs", Long.valueOf(elapsed));
        stats.put("findingCount", Integer.valueOf(findingCount));
        stats.put("spotbugsVersion", Version.VERSION_STRING);
        stats.put("targetResolutionRootCount", Integer.valueOf(analyzer.getLastTargetResolutionRootCount()));
        stats.put("runtimeClasspathCount", Integer.valueOf(config.getRuntimeClasspaths().size()));
        stats.put("extraAuxClasspathCount", Integer.valueOf(config.getExtraAuxClasspaths().size()));
        stats.put("auxClasspathCount", Integer.valueOf(analyzer.getLastAuxClasspathCount()));
        stats.put("targetCount", Integer.valueOf(analyzer.getLastTargetCount()));
        stats.put("pluginCount", Integer.valueOf(config.getPlugins().size()));
        return stats;
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

    private AnalysisConfig parseAndValidateConfig(String configJson) throws CommandActionException {
        ConfigParseResult parseResult = configParser.parse(configJson);
        if (parseResult.hasError()) {
            throw configFailure(parseResult.getError());
        }

        ConfigSchema schema = parseResult.getSchema();
        ConfigValidationResult validationResult = configValidator.validate(schema);
        if (validationResult.hasError()) {
            throw configFailure(validationResult.getError());
        }
        return validationResult.getConfig();
    }

    private CommandActionException configFailure(ConfigError error) {
        String code = error != null ? error.getCode() : "CFG_ERROR";
        String message = error != null ? error.getMessage() : "Configuration error";
        return new CommandActionException(code, message);
    }

    interface AnalyzerServiceFactory {
        AnalyzerService create();
    }
}
