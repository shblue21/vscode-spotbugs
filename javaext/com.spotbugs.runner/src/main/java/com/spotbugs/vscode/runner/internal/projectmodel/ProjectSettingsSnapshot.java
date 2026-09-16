package com.spotbugs.vscode.runner.internal.projectmodel;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

/** Selection facts and declared outputs derived from the same JDT settings response. */
public final class ProjectSettingsSnapshot {
    private static final String ENTRIES = "org.eclipse.jdt.ls.core.classpathEntries";
    public final JsonObject settings;
    public final Map<String, String> declaredSourceOutputs;

    private ProjectSettingsSnapshot(JsonObject settings, Map<String, String> outputs) {
        this.settings = settings;
        this.declaredSourceOutputs = Collections.unmodifiableMap(new LinkedHashMap<>(outputs));
    }

    public static ProjectSettingsSnapshot fromSettings(Object raw) {
        JsonElement json = new Gson().toJsonTree(raw);
        if (json == null || !json.isJsonObject()) return null;
        JsonObject settings = json.getAsJsonObject();
        Map<String, String> outputs = new LinkedHashMap<>();
        JsonElement entries = settings.get(ENTRIES);
        if (entries != null && entries.isJsonArray()) {
            for (JsonElement item : entries.getAsJsonArray()) {
                if (!item.isJsonObject()) continue;
                JsonObject entry = item.getAsJsonObject();
                JsonElement kind = entry.get("kind");
                if (kind == null || !kind.isJsonPrimitive() || !kind.getAsJsonPrimitive().isNumber()
                        || kind.getAsDouble() != 3) continue; // IClasspathEntry.CPE_SOURCE
                String source = text(entry.get("path"));
                String output = text(entry.get("output"));
                if (source != null && output != null) outputs.put(source, output);
            }
        }
        return new ProjectSettingsSnapshot(settings, outputs);
    }

    private static String text(JsonElement value) {
        if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString()) return null;
        String text = value.getAsString().trim();
        return text.isEmpty() ? null : text;
    }
}
