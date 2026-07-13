package com.spotbugs.vscode.runner.internal.command;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import org.eclipse.core.runtime.NullProgressMonitor;
import org.junit.Test;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.spotbugs.vscode.runner.api.PluginInventoryEntry;
import com.spotbugs.vscode.runner.internal.PluginInventoryService;

public class PluginInventoryActionTest {

    @Test
    public void executeReturnsInvalidArgumentForBadRequestJson() {
        JsonObject response = execute(new PluginInventoryAction(), "{");

        assertEquals("INVALID_ARGUMENT", response.getAsJsonArray("errors")
                .get(0).getAsJsonObject().get("code").getAsString());
    }

    @Test
    public void executeTrimsPluginPathsAndPreservesEmptyEntriesBeforeInspecting() {
        List<String> capturedPaths = new ArrayList<>();
        PluginInventoryAction action = new PluginInventoryAction(new PluginInventoryService() {
            @Override
            public List<PluginInventoryEntry> inspect(List<String> pluginPaths) {
                capturedPaths.addAll(pluginPaths);
                return Collections.emptyList();
            }
        });

        execute(action, "{\"plugins\":[\"  \",\"  /workspace/plugin.jar  \"]}");

        assertEquals(Arrays.asList("", "/workspace/plugin.jar"), capturedPaths);
    }

    @Test
    public void executeSerializesOptionalPluginMetadataAndCounts() {
        PluginInventoryEntry complete = new PluginInventoryEntry(
                0,
                "/workspace/plugin.jar",
                "/workspace/plugin.jar",
                "VALIDATED",
                "com.example.plugin",
                "Example plugin",
                "Example provider",
                "https://example.com",
                "1.2.3",
                2,
                3,
                null
        );
        PluginInventoryAction action = new PluginInventoryAction(new PluginInventoryService() {
            @Override
            public List<PluginInventoryEntry> inspect(List<String> pluginPaths) {
                return Collections.singletonList(complete);
            }
        });

        JsonObject response = execute(action, "{\"plugins\":[\"/workspace/plugin.jar\"]}");
        JsonObject serialized = response.getAsJsonArray("results")
                .get(0).getAsJsonObject();

        assertEquals("Example plugin", serialized.get("shortDescription").getAsString());
        assertEquals("Example provider", serialized.get("provider").getAsString());
        assertEquals("https://example.com", serialized.get("website").getAsString());
        assertEquals("1.2.3", serialized.get("version").getAsString());
        assertEquals(2, serialized.get("detectorCount").getAsInt());
        assertEquals(3, serialized.get("bugPatternCount").getAsInt());
        assertFalse(serialized.has("errorMessage"));
    }

    private static JsonObject execute(PluginInventoryAction action, Object... args) {
        String raw = action.execute(new ActionInvocation(
                "java.spotbugs.plugins.inventory",
                args,
                new NullProgressMonitor(),
                Thread.currentThread(),
                System.nanoTime()
        ));
        return JsonParser.parseString(raw).getAsJsonObject();
    }
}
