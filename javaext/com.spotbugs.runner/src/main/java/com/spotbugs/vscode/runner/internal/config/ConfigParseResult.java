package com.spotbugs.vscode.runner.internal.config;

import com.spotbugs.vscode.runner.api.ConfigError;
import com.spotbugs.vscode.runner.api.ConfigSchema;

/** Either a parsed ConfigSchema or a ConfigError. */
public class ConfigParseResult {
    private final ConfigSchema schema;
    private final ConfigError error;

    private ConfigParseResult(ConfigSchema schema, ConfigError error) {
        this.schema = schema;
        this.error = error;
    }

    public static ConfigParseResult ok(ConfigSchema schema) {
        return new ConfigParseResult(schema, null);
    }

    public static ConfigParseResult error(String code, String message) {
        return new ConfigParseResult(null, new ConfigError(code, message));
    }

    public ConfigSchema getSchema() { return schema; }
    public ConfigError getError() { return error; }
    public boolean hasError() { return error != null; }
}

