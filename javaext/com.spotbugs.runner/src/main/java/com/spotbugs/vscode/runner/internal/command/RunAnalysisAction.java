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

    private final ConfigParser configParser;
    private final ConfigValidator configValidator;

    public RunAnalysisAction() {
        this(new ConfigParser(), new ConfigValidator());
    }

    RunAnalysisAction(ConfigParser parser, ConfigValidator validator) {
        this.configParser = parser;
        this.configValidator = validator;
    }

    @Override
    public String id() {
        return COMMAND_ID;
    }

    @Override
    protected CommandResult run(ActionContext context) throws Exception {
        String targetPath = context.requireStringArg(0, "path");
        String configJson = context.optionalStringArg(1);
        if (configJson == null || configJson.trim().isEmpty()) {
            configJson = "{}";
        }

        AnalysisConfig config = parseAndValidateConfig(configJson);

        AnalyzerService analyzer = new AnalyzerService();
        analyzer.setConfiguration(config);
        long start = System.currentTimeMillis();
        List<BugInfo> bugs = analyzer.analyzeToBugs(targetPath);
        long elapsed = System.currentTimeMillis() - start;

        List<BugInfo> results = bugs != null ? bugs : java.util.Collections.emptyList();
        Map<String, Object> stats = new HashMap<>();
        stats.put("target", targetPath);
        stats.put("durationMs", Long.valueOf(elapsed));
        stats.put("findingCount", Integer.valueOf(results.size()));
        stats.put("spotbugsVersion", Version.VERSION_STRING);
        stats.put("classpathCount", Integer.valueOf(config.getClasspaths().size()));
        stats.put("pluginCount", Integer.valueOf(config.getPlugins().size()));

        return success(CommandResponse.success(results, stats));
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
        return new CommandActionException(code, code + ": " + message);
    }
}
