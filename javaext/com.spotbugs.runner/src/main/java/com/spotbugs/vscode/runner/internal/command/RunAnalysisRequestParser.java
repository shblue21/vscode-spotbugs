package com.spotbugs.vscode.runner.internal.command;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.spotbugs.vscode.runner.internal.AnalysisInput;
import java.util.ArrayList;
import java.util.List;

import com.spotbugs.vscode.runner.api.ConfigError;
import com.spotbugs.vscode.runner.api.ConfigSchema;
import com.spotbugs.vscode.runner.internal.config.ConfigParseResult;
import com.spotbugs.vscode.runner.internal.config.ConfigParser;
import com.spotbugs.vscode.runner.internal.config.ConfigValidationResult;
import com.spotbugs.vscode.runner.internal.config.ConfigValidator;

final class RunAnalysisRequestParser {

    private final ConfigParser configParser = new ConfigParser();
    private final ConfigValidator configValidator = new ConfigValidator();

    RunAnalysisRequest parse(AbstractCommandAction.ActionContext context)
            throws AbstractCommandAction.CommandActionException {
        String targetPath = context.requireStringArg(0, "path");
        String configJson = context.optionalStringArg(1);
        if (configJson == null || configJson.trim().isEmpty()) {
            configJson = "{}";
        }

        return parseAndValidateRequest(targetPath, configJson);
    }

    private RunAnalysisRequest parseAndValidateRequest(String targetPath, String configJson)
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
        return new RunAnalysisRequest(targetPath, validationResult.getConfig(),
                Boolean.TRUE.equals(schema.getIncludeBaselineXml()), parseInputs(configJson));
    }

    private AnalysisInput[] parseInputs(String json) throws AbstractCommandAction.CommandActionException {
        try {
            JsonElement inputs = JsonParser.parseString(json).getAsJsonObject().get("inputs");
            if (inputs == null || !inputs.isJsonArray() || inputs.getAsJsonArray().size() == 0) throw new IllegalArgumentException();
            List<AnalysisInput> result = new ArrayList<>();
            for (JsonElement element : inputs.getAsJsonArray()) {
                JsonObject input = element.getAsJsonObject();
                if (!input.get("path").isJsonPrimitive() || !input.get("path").getAsJsonPrimitive().isString()
                        || !input.get("kind").isJsonPrimitive() || !input.get("kind").getAsJsonPrimitive().isString()) throw new IllegalArgumentException();
                String kind = input.get("kind").getAsString();
                if (!kind.equals("source") && !kind.equals("artifact")) throw new IllegalArgumentException();
                result.add(new AnalysisInput(kind.equals("source") ? AnalysisInput.Kind.SOURCE : AnalysisInput.Kind.ARTIFACT, input.get("path").getAsString()));
            }
            return result.toArray(new AnalysisInput[0]);
        } catch (RuntimeException error) {
            throw new AbstractCommandAction.CommandActionException("INVALID_ARGUMENT", "Analysis requires non-empty inputs with source/artifact kind and path");
        }
    }

    private AbstractCommandAction.CommandActionException configFailure(ConfigError error) {
        String code = error != null ? error.getCode() : "CFG_ERROR";
        String message = error != null ? error.getMessage() : "Configuration error";
        return new AbstractCommandAction.CommandActionException(code, message);
    }
}
