package com.spotbugs.vscode.runner.internal.command;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

import java.util.Collections;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.core.runtime.NullProgressMonitor;
import org.junit.Test;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.spotbugs.vscode.runner.api.BugInfo;
import com.spotbugs.vscode.runner.api.CommandResponse;
import com.spotbugs.vscode.runner.api.RunAnalysisSummary;
import com.spotbugs.vscode.runner.internal.AnalyzerService;

public class RunAnalysisActionTest {

    @Test
    public void executeWrapsAnalyzerFailuresWithRootCauseAsAnalysisFailedEnvelope() {
        RunAnalysisAction action = new RunAnalysisAction(() -> new AnalyzerService() {
            @Override
            public List<BugInfo> analyzeToBugs(IProgressMonitor monitor, String... filePaths) {
                throw new RuntimeException("outer", new IllegalStateException("inner"));
            }
        });

        JsonObject response = executeDefault(action);

        assertEquals(2, response.get("schemaVersion").getAsInt());
        assertEquals(0, response.getAsJsonArray("results").size());
        assertEquals("ANALYSIS_FAILED", firstError(response).get("code").getAsString());
        assertEquals("inner", firstError(response).get("message").getAsString());
        assertEquals(0, response.getAsJsonObject("stats").get("findingCount").getAsInt());
    }

    @Test
    public void executeReportsNonzeroFindingCountFromResults() {
        RunAnalysisAction action = new RunAnalysisAction(() -> new AnalyzerService() {
            @Override
            public List<BugInfo> analyzeToBugs(IProgressMonitor monitor, String... filePaths) {
                return Collections.nCopies(2, (BugInfo) null);
            }
        });

        JsonObject response = executeDefault(action);

        assertEquals(2, response.get("schemaVersion").getAsInt());
        assertEquals(0, response.getAsJsonArray("errors").size());
        assertEquals(2, response.getAsJsonArray("results").size());
        assertEquals(2, response.getAsJsonObject("stats").get("findingCount").getAsInt());
    }

    @Test
    public void executeReturnsInvalidArgumentForMissingEmptyOrNonStringTargetPath() {
        AtomicInteger analyzerCreations = new AtomicInteger(0);
        RunAnalysisAction action = new RunAnalysisAction(() -> {
            analyzerCreations.incrementAndGet();
            return emptyAnalyzer();
        });

        JsonObject missing = execute(action);
        JsonObject empty = execute(action, "   ", "{}");
        JsonObject nonString = execute(action, Integer.valueOf(7), "{}");

        assertEquals("INVALID_ARGUMENT", firstError(missing).get("code").getAsString());
        assertEquals("Missing argument at index 0", firstError(missing).get("message").getAsString());
        assertEquals("INVALID_ARGUMENT", firstError(empty).get("code").getAsString());
        assertEquals("Argument 'path' must not be empty", firstError(empty).get("message").getAsString());
        assertEquals("INVALID_ARGUMENT", firstError(nonString).get("code").getAsString());
        assertEquals("Argument 'path' must be a string", firstError(nonString).get("message").getAsString());
        assertEquals(0, analyzerCreations.get());
    }

    @Test
    public void executeReturnsConfigParseErrorsWithoutInvokingAnalyzer() {
        AtomicInteger analyzerCreations = new AtomicInteger(0);
        RunAnalysisAction action = new RunAnalysisAction(() -> {
            analyzerCreations.incrementAndGet();
            return emptyAnalyzer();
        });

        JsonObject response = execute(action, "/workspace/build/classes", "{");

        assertEquals(2, response.get("schemaVersion").getAsInt());
        assertEquals(0, response.getAsJsonArray("results").size());
        assertEquals("CFG_BAD_JSON", firstError(response).get("code").getAsString());
        assertEquals("Invalid config JSON", firstError(response).get("message").getAsString());
        assertFalse(response.has("stats"));
        assertEquals(0, analyzerCreations.get());
    }

    @Test
    public void executeReturnsCancelledEnvelopeWhenMonitorIsCancelledAfterAnalyzerReturns() {
        NullProgressMonitor monitor = new NullProgressMonitor();
        RunAnalysisAction action = new RunAnalysisAction(() -> new AnalyzerService() {
            @Override
            public List<BugInfo> analyzeToBugs(IProgressMonitor progressMonitor, String... filePaths) {
                progressMonitor.setCanceled(true);
                return Collections.emptyList();
            }
        });

        JsonObject response = executeWithMonitor(action, monitor, "/workspace/build/classes", "{}");

        assertEquals(2, response.get("schemaVersion").getAsInt());
        assertEquals("ANALYSIS_CANCELLED", firstError(response).get("code").getAsString());
        assertEquals("Command cancelled", firstError(response).get("message").getAsString());
        assertTrue(response.has("stats"));
        assertEquals(0, response.getAsJsonObject("stats").get("findingCount").getAsInt());
    }

    @Test
    public void executeReportsAllCurrentStatsKeysAndCounts() {
        CountingAnalyzerService analyzer = new CountingAnalyzerService();
        RunAnalysisAction action = new RunAnalysisAction(() -> analyzer);
        String tempDir = jsonString(System.getProperty("java.io.tmpdir"));
        String configJson = "{"
                + "\"targetResolutionRoots\":[\"/workspace/out-a\",\"/workspace/out-b\",\"/workspace/out-c\"],"
                + "\"runtimeClasspaths\":[\"/workspace/out-a\",\"/workspace/lib.jar\"],"
                + "\"extraAuxClasspaths\":[\"" + tempDir + "\"],"
                + "\"plugins\":[\"/workspace/plugin-a.jar\",\"/workspace/plugin-b.jar\"]"
                + "}";

        JsonObject response = execute(action, "/workspace/build/classes", configJson);
        JsonObject stats = response.getAsJsonObject("stats");

        assertEquals("/workspace/build/classes", stats.get("target").getAsString());
        assertTrue(stats.get("durationMs").getAsLong() >= 0L);
        assertEquals(0, stats.get("findingCount").getAsInt());
        assertTrue(stats.get("spotbugsVersion").getAsString().length() > 0);
        assertEquals(7, stats.get("targetResolutionRootCount").getAsInt());
        assertEquals(2, stats.get("runtimeClasspathCount").getAsInt());
        assertEquals(1, stats.get("extraAuxClasspathCount").getAsInt());
        assertEquals(4, stats.get("auxClasspathCount").getAsInt());
        assertEquals(5, stats.get("targetCount").getAsInt());
        assertEquals(2, stats.get("pluginCount").getAsInt());
    }

    @Test
    public void commandResponseKeepsStatsJsonFieldForTypedRunAnalysisSummary() {
        RunAnalysisSummary summary = new RunAnalysisSummary(
                "/workspace/build/classes",
                42L,
                3,
                "4.9.8",
                7,
                2,
                1,
                4,
                5,
                2
        );

        CommandResponse response = CommandResponse.success(Collections.emptyList(), summary);
        JsonObject json = JsonParser.parseString(new Gson().toJson(response)).getAsJsonObject();
        JsonObject stats = json.getAsJsonObject("stats");

        assertSame(summary, response.getStats());
        assertEquals("/workspace/build/classes", stats.get("target").getAsString());
        assertEquals(42L, stats.get("durationMs").getAsLong());
        assertEquals(3, stats.get("findingCount").getAsInt());
        assertEquals("4.9.8", stats.get("spotbugsVersion").getAsString());
        assertEquals(7, stats.get("targetResolutionRootCount").getAsInt());
        assertEquals(2, stats.get("runtimeClasspathCount").getAsInt());
        assertEquals(1, stats.get("extraAuxClasspathCount").getAsInt());
        assertEquals(4, stats.get("auxClasspathCount").getAsInt());
        assertEquals(5, stats.get("targetCount").getAsInt());
        assertEquals(2, stats.get("pluginCount").getAsInt());
    }

    private static JsonObject executeDefault(RunAnalysisAction action) {
        return execute(action, "/workspace/build/classes", "{}");
    }

    private static JsonObject execute(RunAnalysisAction action, Object... args) {
        return executeWithMonitor(action, new NullProgressMonitor(), args);
    }

    private static JsonObject executeWithMonitor(RunAnalysisAction action, IProgressMonitor monitor, Object... args) {
        String json = action.execute(new ActionInvocation(
                "java.spotbugs.run",
                args,
                monitor,
                Thread.currentThread(),
                System.nanoTime()
        ));
        return JsonParser.parseString(json).getAsJsonObject();
    }

    private static JsonObject firstError(JsonObject response) {
        return response.getAsJsonArray("errors").get(0).getAsJsonObject();
    }

    private static String jsonString(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private static AnalyzerService emptyAnalyzer() {
        return new AnalyzerService() {
            @Override
            public List<BugInfo> analyzeToBugs(IProgressMonitor monitor, String... filePaths) {
                return Collections.emptyList();
            }
        };
    }

    private static final class CountingAnalyzerService extends AnalyzerService {
        @Override
        public List<BugInfo> analyzeToBugs(IProgressMonitor monitor, String... filePaths) {
            return Collections.emptyList();
        }

        @Override
        public int getLastTargetCount() {
            return 5;
        }

        @Override
        public int getLastTargetResolutionRootCount() {
            return 7;
        }

        @Override
        public int getLastAuxClasspathCount() {
            return 4;
        }
    }
}
