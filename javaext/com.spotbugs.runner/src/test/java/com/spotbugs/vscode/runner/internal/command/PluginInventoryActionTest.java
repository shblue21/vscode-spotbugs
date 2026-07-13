package com.spotbugs.vscode.runner.internal.command;

import static org.junit.Assert.assertEquals;

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
