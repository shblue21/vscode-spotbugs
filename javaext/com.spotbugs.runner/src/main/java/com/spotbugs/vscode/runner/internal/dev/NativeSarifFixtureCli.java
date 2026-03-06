package com.spotbugs.vscode.runner.internal.dev;

import java.util.List;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.spotbugs.vscode.runner.api.BugInfo;
import com.spotbugs.vscode.runner.api.ConfigError;
import com.spotbugs.vscode.runner.api.ConfigSchema;
import com.spotbugs.vscode.runner.internal.AnalyzerService;
import com.spotbugs.vscode.runner.internal.config.AnalysisConfig;
import com.spotbugs.vscode.runner.internal.config.ConfigParseResult;
import com.spotbugs.vscode.runner.internal.config.ConfigParser;
import com.spotbugs.vscode.runner.internal.config.ConfigValidationResult;
import com.spotbugs.vscode.runner.internal.config.ConfigValidator;

public final class NativeSarifFixtureCli {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    public static void main(String[] args) throws Exception {
        new NativeSarifFixtureCli().run(args);
    }

    private void run(String[] args) throws Exception {
        if (args.length == 0 || args[0] == null || args[0].trim().isEmpty()) {
            throw new IllegalArgumentException(
                    "Usage: NativeSarifFixtureCli <targetPath> [configJson]"
            );
        }

        String targetPath = args[0];
        String configJson = args.length > 1 && args[1] != null && !args[1].trim().isEmpty()
                ? args[1]
                : "{}";
        AnalysisConfig config = parseAndValidateConfig(configJson);

        AnalyzerService bugAnalyzer = new AnalyzerService();
        bugAnalyzer.setConfiguration(config);
        List<BugInfo> bugs = bugAnalyzer.analyzeToBugs(targetPath);

        AnalyzerService sarifAnalyzer = new AnalyzerService();
        sarifAnalyzer.setConfiguration(config);
        String nativeSarif = sarifAnalyzer.analyzeToNativeSarif(targetPath);
        if (nativeSarif == null || nativeSarif.trim().isEmpty()) {
            throw new IllegalStateException("SpotBugs native SARIF generation returned no output.");
        }

        JsonObject root = new JsonObject();
        root.add("bugs", GSON.toJsonTree(bugs));
        root.add("nativeSarif", JsonParser.parseString(nativeSarif));
        System.out.println(GSON.toJson(root));
    }

    private AnalysisConfig parseAndValidateConfig(String configJson) {
        ConfigParseResult parseResult = new ConfigParser().parse(configJson);
        if (parseResult.hasError()) {
            throw configFailure(parseResult.getError());
        }

        ConfigSchema schema = parseResult.getSchema();
        ConfigValidationResult validationResult = new ConfigValidator().validate(schema);
        if (validationResult.hasError()) {
            throw configFailure(validationResult.getError());
        }
        return validationResult.getConfig();
    }

    private IllegalArgumentException configFailure(ConfigError error) {
        String code = error != null ? error.getCode() : "CFG_ERROR";
        String message = error != null ? error.getMessage() : "Configuration error";
        return new IllegalArgumentException(code + ": " + message);
    }
}
