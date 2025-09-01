package com.spotbugs.vscode.runner.internal.config;

import com.google.gson.Gson;
import com.spotbugs.vscode.runner.api.ConfigSchema;

/** Parses config JSON into a wire schema, capturing bad JSON as ConfigError. */
public class ConfigParser {

    private final Gson gson = new Gson();

    public ConfigParseResult parse(String json) {
        try {
            ConfigSchema schema = gson.fromJson(json, ConfigSchema.class);
            if (schema == null) {
                return ConfigParseResult.error("CFG_BAD_JSON", "Empty config JSON");
            }
            return ConfigParseResult.ok(schema);
        } catch (Exception e) {
            return ConfigParseResult.error("CFG_BAD_JSON", "Invalid config JSON");
        }
    }
}

