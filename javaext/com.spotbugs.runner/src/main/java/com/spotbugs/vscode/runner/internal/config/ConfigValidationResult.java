package com.spotbugs.vscode.runner.internal.config;

import com.spotbugs.vscode.runner.api.ConfigError;

/** Either a validated AnalysisConfig or a ConfigError. */
public class ConfigValidationResult {
    private final AnalysisConfig config;
    private final ConfigError error;

    private ConfigValidationResult(AnalysisConfig config, ConfigError error) {
        this.config = config;
        this.error = error;
    }

    public static ConfigValidationResult ok(AnalysisConfig config) {
        return new ConfigValidationResult(config, null);
    }

    public static ConfigValidationResult error(String code, String message) {
        return new ConfigValidationResult(null, new ConfigError(code, message));
    }

    public AnalysisConfig getConfig() { return config; }
    public ConfigError getError() { return error; }
    public boolean hasError() { return error != null; }
}

