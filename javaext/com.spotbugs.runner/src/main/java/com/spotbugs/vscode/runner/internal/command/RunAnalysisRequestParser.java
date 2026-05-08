package com.spotbugs.vscode.runner.internal.command;

import com.spotbugs.vscode.runner.api.ConfigError;
import com.spotbugs.vscode.runner.api.ConfigSchema;
import com.spotbugs.vscode.runner.internal.config.AnalysisConfig;
import com.spotbugs.vscode.runner.internal.config.ConfigParseResult;
import com.spotbugs.vscode.runner.internal.config.ConfigParser;
import com.spotbugs.vscode.runner.internal.config.ConfigValidationResult;
import com.spotbugs.vscode.runner.internal.config.ConfigValidator;

final class RunAnalysisRequestParser {

    private final ConfigParser configParser;
    private final ConfigValidator configValidator;

    RunAnalysisRequestParser() {
        this(new ConfigParser(), new ConfigValidator());
    }

    RunAnalysisRequestParser(ConfigParser parser, ConfigValidator validator) {
        this.configParser = parser != null ? parser : new ConfigParser();
        this.configValidator = validator != null ? validator : new ConfigValidator();
    }

    RunAnalysisRequest parse(AbstractCommandAction.ActionContext context)
            throws AbstractCommandAction.CommandActionException {
        String targetPath = context.requireStringArg(0, "path");
        String configJson = context.optionalStringArg(1);
        if (configJson == null || configJson.trim().isEmpty()) {
            configJson = "{}";
        }

        AnalysisConfig config = parseAndValidateConfig(configJson);
        return new RunAnalysisRequest(targetPath, config);
    }

    private AnalysisConfig parseAndValidateConfig(String configJson)
            throws AbstractCommandAction.CommandActionException {
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

    private AbstractCommandAction.CommandActionException configFailure(ConfigError error) {
        String code = error != null ? error.getCode() : "CFG_ERROR";
        String message = error != null ? error.getMessage() : "Configuration error";
        return new AbstractCommandAction.CommandActionException(code, message);
    }
}
