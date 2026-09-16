package com.spotbugs.vscode.runner.internal.command;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CancellationException;
import java.util.concurrent.atomic.AtomicInteger;

import org.eclipse.core.runtime.NullProgressMonitor;
import org.junit.Test;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

public class ProjectSettingsActionTest {
    @Test
    public void readsSettingsOnceAndPreservesSelectionFactsWithoutReclassifyingThem() {
        Map<String, Object> raw = Map.of(
                "org.eclipse.jdt.ls.core.sourcePaths", List.of("/p/src", "/p/generated", "/p/src/test/java"),
                "org.eclipse.jdt.ls.core.outputPath", "/p/default",
                "org.eclipse.jdt.ls.core.classpathEntries", List.of(
                        Map.of("kind", 3, "path", "/p/src", "attributes", Map.of("gradle_used_by_scope", "main,test")),
                        Map.of("kind", 3, "path", "/p/generated", "output", "/p/generated-out"),
                        Map.of("kind", 3, "path", "/p/src/test/java", "output", "/p/test-out", "attributes", Map.of("test", "true")),
                        Map.of("kind", 1, "path", "/p/lib.jar", "output", "/p/not-a-source-output")));
        AtomicInteger calls = new AtomicInteger();
        ProjectSettingsAction action = new ProjectSettingsAction(uri -> {
            calls.incrementAndGet();
            assertEquals("file:///p", uri);
            return raw;
        });
        JsonObject response = JsonParser.parseString(action.execute(new Object[] { "file:///p" }, null)).getAsJsonObject();
        assertEquals(1, calls.get());
        assertEquals(1, response.getAsJsonArray("results").size());
        JsonObject snapshot = response.getAsJsonArray("results").get(0).getAsJsonObject();
        assertEquals(new Gson().toJsonTree(raw), snapshot.get("settings"));
        assertEquals(new Gson().toJsonTree(Map.of("/p/generated", "/p/generated-out", "/p/src/test/java", "/p/test-out")),
                snapshot.get("declaredSourceOutputs"));
    }

    @Test
    public void returnsEmptyBindingMapForIncompleteSettingsInsteadOfInventingOutputs() {
        ProjectSettingsAction action = new ProjectSettingsAction(uri -> Map.of("org.eclipse.jdt.ls.core.outputPath", "/p/bin"));
        JsonObject response = JsonParser.parseString(action.execute(new Object[] { "file:///p" }, null)).getAsJsonObject();
        assertEquals(0, response.getAsJsonArray("results").get(0).getAsJsonObject().getAsJsonObject("declaredSourceOutputs").size());
        assertEquals(0, response.getAsJsonArray("errors").size());
    }

    @Test
    public void reportsMissingSettingsAndCancellationWithoutRetrying() {
        AtomicInteger calls = new AtomicInteger();
        ProjectSettingsAction missing = new ProjectSettingsAction(uri -> { calls.incrementAndGet(); return null; });
        assertEquals("JAVA_LS_PROJECT_SETTINGS_FAILED", error(missing.execute(new Object[] { "file:///p" }, null)));
        assertEquals(1, calls.get());
        ProjectSettingsAction cancelled = new ProjectSettingsAction(uri -> { throw new CancellationException(); });
        assertEquals("ANALYSIS_CANCELLED", error(cancelled.execute(new Object[] { "file:///p" }, null)));
        NullProgressMonitor monitor = new NullProgressMonitor();
        monitor.setCanceled(true);
        assertEquals("ANALYSIS_CANCELLED", error(missing.execute(new Object[] { "file:///p" }, monitor)));
        assertEquals(1, calls.get());
        assertTrue(missing.id().startsWith("java.spotbugs."));
    }

    private String error(String json) {
        return JsonParser.parseString(json).getAsJsonObject().getAsJsonArray("errors")
                .get(0).getAsJsonObject().get("code").getAsString();
    }
}
