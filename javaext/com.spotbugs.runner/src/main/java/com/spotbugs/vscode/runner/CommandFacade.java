package com.spotbugs.vscode.runner;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.google.gson.Gson;
import com.spotbugs.vscode.runner.api.ConfigError;
import com.spotbugs.vscode.runner.api.ConfigSchema;
import com.spotbugs.vscode.runner.internal.AnalyzerService;
import com.spotbugs.vscode.runner.internal.config.AnalysisConfig;
import com.spotbugs.vscode.runner.internal.config.ConfigParseResult;
import com.spotbugs.vscode.runner.internal.config.ConfigParser;
import com.spotbugs.vscode.runner.internal.config.ConfigValidationResult;
import com.spotbugs.vscode.runner.internal.config.ConfigValidator;

/**
 * A thin facade that parses inputs, prepares AnalyzerService configuration,
 * invokes analysis, and returns a JSON string result.
 *
 * This keeps the JDT LS delegate handler free from business logic and
 * concentrates JSON (de)serialization here at the command boundary.
 */
public class CommandFacade {

    private final Gson gson = new Gson();

    /**
     * Run SpotBugs analysis for a single path (file or folder), using the
     * provided JSON configuration string.
     *
     * @param pathArg      first argument from command (expected String)
     * @param configJsonArg second argument from command (expected String JSON)
     * @return JSON string array of BugInfo, or "[]" on error
     */
    public String runAnalysis(Object pathArg, Object configJsonArg) {
        try {
            if (!(pathArg instanceof String) || !(configJsonArg instanceof String)) {
                return gson.toJson(java.util.Collections.singletonMap("error", "Invalid argument types"));
            }
            final String path = (String) pathArg;
            final String configJson = (String) configJsonArg;

            // Parse wire JSON → schema
            ConfigParseResult parsed = new ConfigParser().parse(configJson);
            if (parsed.hasError()) {
                return gson.toJson(errorEnvelope(parsed.getError()));
            }
            ConfigSchema schema = parsed.getSchema();
            // Validate and map → domain config
            ConfigValidationResult vr = new ConfigValidator().validate(schema);
            if (vr.hasError()) {
                return gson.toJson(errorEnvelope(vr.getError()));
            }
            AnalysisConfig cfg = vr.getConfig();

            AnalyzerService analyzer = new AnalyzerService();
            analyzer.setConfiguration(cfg);
            java.util.List<com.spotbugs.vscode.runner.api.BugInfo> bugs = analyzer.analyzeToBugs(path);
            return gson.toJson(bugs);
        } catch (Exception e) {
            return gson.toJson(java.util.Collections.singletonMap("error", e.getMessage() != null ? e.getMessage() : "Analysis failed"));
        }
    }

    private java.util.Map<String, Object> errorEnvelope(ConfigError err) {
        java.util.Map<String, Object> m = new java.util.HashMap<>();
        m.put("error", err != null ? (err.getCode() + ": " + err.getMessage()) : "Configuration error");
        m.put("code", err != null ? err.getCode() : "CFG_ERROR");
        return m;
    }
}
