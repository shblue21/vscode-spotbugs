package com.spotbugs.vscode.runner;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.google.gson.Gson;
import com.spotbugs.vscode.runner.api.Config;

/**
 * A thin facade that parses inputs, prepares AnalyzerService configuration,
 * invokes analysis, and returns a JSON string result.
 *
 * This keeps the JDT LS delegate handler free from business logic and
 * concentrates JSON (de)serialization here at the command boundary.
 */
public class CommandFacade {

    private final Gson gson = new Gson();

    private void log(String message) {
        System.out.println("[SpotBugs][Facade] " + message);
    }

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
                log("Invalid argument types. Expected (String path, String configJson)");
                return "[]";
            }
            final String path = (String) pathArg;
            final String configJson = (String) configJsonArg;

            final Config cfg;
            try {
                cfg = gson.fromJson(configJson, Config.class);
            } catch (Exception e) {
                log("Failed to parse config JSON: " + e.getMessage());
                return "[]";
            }

            log("Analyzing path: " + path);
            log("Config: " + cfg.toString());

            AnalyzerService analyzer = new AnalyzerService();
            analyzer.setConfiguration(toConfigMap(cfg));
            return analyzer.analyze(path);
        } catch (Exception e) {
            System.err.println("[SpotBugs][Facade] Analysis failed: " + e.getMessage());
            e.printStackTrace();
            return "[]";
        }
    }

    private Map<String, Object> toConfigMap(Config cfg) {
        Map<String, Object> map = new HashMap<>();
        if (cfg == null) {
            return map;
        }
        map.put("effort", cfg.getEffort());
        List<String> cps = cfg.getClasspaths();
        if (cps != null) {
            map.put("classpaths", cps);
        }
        return map;
    }
}

