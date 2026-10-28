package com.spotbugs.vscode.runner.internal.config;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.spotbugs.vscode.runner.api.ConfigSchema;

/** Parses config JSON into a wire schema, capturing bad JSON as ConfigError. */
public class ConfigParser {

    private final Gson gson = new Gson();

    public ConfigParseResult parse(String json) {
        try {
            JsonObject object = JsonParser.parseString(json).getAsJsonObject();
            checkDetectors(object.get("detectors"));
            if (object.has("plugins")) {
                for (JsonElement value : object.getAsJsonArray("plugins")) {
                    JsonObject plugin = value.getAsJsonObject();
                    JsonElement path = plugin.get("path");
                    if (path == null || !path.isJsonPrimitive() || !path.getAsJsonPrimitive().isString()) {
                        return ConfigParseResult.error("CFG_PLUGINS_INVALID", "Each plugin requires a string path value");
                    }
                    checkDetectors(plugin.get("detectors"));
                }
            }
            ConfigSchema schema = gson.fromJson(object, ConfigSchema.class);
            return ConfigParseResult.ok(schema);
        } catch (Exception e) {
            return ConfigParseResult.error("CFG_BAD_JSON", "Invalid config JSON");
        }
    }
    private static void checkDetectors(JsonElement value) {
        if (value == null) return;
        for (JsonElement enabled : value.getAsJsonObject().asMap().values()) {
            if (!enabled.isJsonPrimitive() || !enabled.getAsJsonPrimitive().isBoolean()) {
                throw new IllegalArgumentException("Detector overrides must be booleans");
            }
        }
    }
}

