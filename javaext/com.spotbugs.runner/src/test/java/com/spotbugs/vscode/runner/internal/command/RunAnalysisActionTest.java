package com.spotbugs.vscode.runner.internal.command;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

import java.util.Collections;
import java.util.concurrent.atomic.AtomicInteger;

import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.core.runtime.NullProgressMonitor;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.junit.runners.Parameterized;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.spotbugs.vscode.runner.api.AnalysisReportSummary;
import com.spotbugs.vscode.runner.api.BugInfo;
import com.spotbugs.vscode.runner.api.CommandWarning;
import com.spotbugs.vscode.runner.api.CommandResponse;
import com.spotbugs.vscode.runner.api.RunAnalysisSummary;
import com.spotbugs.vscode.runner.internal.AnalyzerService;
import com.spotbugs.vscode.runner.internal.AnalysisInput;
import com.spotbugs.vscode.runner.internal.SpotBugsAnalysisResult;

@RunWith(Parameterized.class)
public class RunAnalysisActionTest {

    @Parameterized.Parameters(name = "{0}")
    public static Object[] inputKinds() {
        return AnalysisInput.Kind.values();
    }

    private final AnalysisInput.Kind inputKind;

    public RunAnalysisActionTest(AnalysisInput.Kind inputKind) {
        this.inputKind = inputKind;
    }


    @Test
    public void executeWrapsAnalyzerFailuresWithRootCauseAsAnalysisFailedEnvelope() throws Exception {
        RunAnalysisAction action = new RunAnalysisAction(inputKind, () -> new AnalyzerService() {
            @Override
            public SpotBugsAnalysisResult analyzeToBugsWithWarnings(IProgressMonitor monitor, String... filePaths) {
                throw new RuntimeException("outer", new IllegalStateException("inner"));
            }
        });

        JsonObject response = executeDefault(action);
        JsonObject stats = response.getAsJsonObject("stats");

        assertEquals(2, response.get("schemaVersion").getAsInt());
        assertEquals(0, response.getAsJsonArray("results").size());
        assertEquals("ANALYSIS_FAILED", firstError(response).get("code").getAsString());
        assertEquals("inner", firstError(response).get("message").getAsString());
        assertEquals("/workspace/build/classes", stats.get("target").getAsString());
        assertTrue(stats.get("durationMs").getAsLong() >= 0L);
        assertEquals(0, stats.get("findingCount").getAsInt());
        assertTrue(stats.get("spotbugsVersion").getAsString().length() > 0);
        assertEquals(0, stats.get("targetResolutionRootCount").getAsInt());
        assertEquals(0, stats.get("runtimeClasspathCount").getAsInt());
        assertEquals(0, stats.get("extraAuxClasspathCount").getAsInt());
        assertEquals(0, stats.get("auxClasspathCount").getAsInt());
        assertEquals(0, stats.get("targetCount").getAsInt());
        assertEquals(0, stats.get("pluginCount").getAsInt());
    }

    @Test
    public void executeWrapsLinkageErrorsAsAnalysisFailedEnvelope() {
        RunAnalysisAction action = new RunAnalysisAction(inputKind, () -> new AnalyzerService() {
            @Override
            public SpotBugsAnalysisResult analyzeToBugsWithWarnings(IProgressMonitor monitor, String... filePaths) {
                throw new NoClassDefFoundError("missing detector dependency");
            }
        });

        JsonObject response = executeDefault(action);
        JsonObject stats = response.getAsJsonObject("stats");

        assertEquals(2, response.get("schemaVersion").getAsInt());
        assertEquals("ANALYSIS_FAILED", firstError(response).get("code").getAsString());
        assertEquals("missing detector dependency", firstError(response).get("message").getAsString());
        assertEquals("/workspace/build/classes", stats.get("target").getAsString());
        assertTrue(stats.get("durationMs").getAsLong() >= 0L);
        assertEquals(0, stats.get("findingCount").getAsInt());
    }

    @Test
    public void executeReportsNonzeroFindingCountFromResults() {
        RunAnalysisAction action = new RunAnalysisAction(inputKind, () -> new AnalyzerService() {
            @Override
            public SpotBugsAnalysisResult analyzeToBugsWithWarnings(IProgressMonitor monitor,
                    boolean includeBaselineXml, String... filePaths) {
                assertTrue(includeBaselineXml);
                return new SpotBugsAnalysisResult(
                        Collections.nCopies(2, (BugInfo) null),
                        Collections.emptyList(),
                        null,
                        "{\"version\":\"2.1.0\",\"runs\":[]}",
                        "<?xml version=\"1.0\"?><BugCollection/>"
                );
            }
        });

        JsonObject response = execute(action, "/workspace/build/classes", "{\"includeBaselineXml\":true}");

        assertEquals(2, response.get("schemaVersion").getAsInt());
        assertEquals(0, response.getAsJsonArray("errors").size());
        assertEquals(2, response.getAsJsonArray("results").size());
        assertEquals(2, response.getAsJsonObject("stats").get("findingCount").getAsInt());
        assertEquals("2.1.0", JsonParser.parseString(response.get("nativeSarif").getAsString())
                .getAsJsonObject().get("version").getAsString());
        assertTrue(response.get("baselineXml").getAsString().contains("BugCollection"));
    }

    @Test
    public void executeSerializesWarningsFromSuccessfulAnalysis() {
        RunAnalysisAction action = new RunAnalysisAction(inputKind, () -> new AnalyzerService() {
            @Override
            public SpotBugsAnalysisResult analyzeToBugsWithWarnings(IProgressMonitor monitor, String... filePaths) {
                return new SpotBugsAnalysisResult(
                        Collections.emptyList(),
                        Collections.singletonList(new CommandWarning(
                                "PLUGIN_CLEANUP_CLOSE_FAILED",
                                "Failed to close plugin com.example: close failed"
                        ))
                );
            }
        });

        JsonObject response = executeDefault(action);

        assertEquals(2, response.get("schemaVersion").getAsInt());
        assertEquals(0, response.getAsJsonArray("results").size());
        assertEquals(0, response.getAsJsonArray("errors").size());
        assertTrue(response.has("warnings"));
        assertEquals(1, response.getAsJsonArray("warnings").size());
        JsonObject warning = response.getAsJsonArray("warnings").get(0).getAsJsonObject();
        assertEquals("PLUGIN_CLEANUP_CLOSE_FAILED", warning.get("code").getAsString());
        assertEquals("Failed to close plugin com.example: close failed", warning.get("message").getAsString());
    }

    @Test
    public void executeReturnsInvalidArgumentForMissingEmptyOrNonStringTargetPath() {
        AtomicInteger analyzerCreations = new AtomicInteger(0);
        RunAnalysisAction action = new RunAnalysisAction(inputKind, () -> {
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
        RunAnalysisAction action = new RunAnalysisAction(inputKind, () -> {
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
        RunAnalysisAction action = new RunAnalysisAction(inputKind, () -> new AnalyzerService() {
            @Override
            public SpotBugsAnalysisResult analyzeToBugsWithWarnings(IProgressMonitor progressMonitor, String... filePaths) {
                progressMonitor.setCanceled(true);
                return SpotBugsAnalysisResult.empty();
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
    public void executeDoesNotCreateAnalyzerWhenMonitorIsAlreadyCancelled() {
        NullProgressMonitor monitor = new NullProgressMonitor();
        monitor.setCanceled(true);
        AtomicInteger analyzerCreations = new AtomicInteger(0);
        RunAnalysisAction action = new RunAnalysisAction(inputKind, () -> {
            analyzerCreations.incrementAndGet();
            return emptyAnalyzer();
        });

        JsonObject response = executeWithMonitor(action, monitor, "/workspace/build/classes", "{}");

        assertEquals("ANALYSIS_CANCELLED", firstError(response).get("code").getAsString());
        assertEquals(0, analyzerCreations.get());
    }

    @Test
    public void executeReportsAllCurrentStatsKeysAndCounts() {
        CountingAnalyzerService analyzer = new CountingAnalyzerService();
        RunAnalysisAction action = new RunAnalysisAction(inputKind, () -> analyzer);
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
        AnalysisReportSummary reportSummary = new AnalysisReportSummary(1200, 4, 2);

        CommandResponse response = CommandResponse.success(
                Collections.emptyList(),
                summary,
                reportSummary,
                Collections.emptyList(),
                null,
                null
        );
        JsonObject json = JsonParser.parseString(new Gson().toJson(response)).getAsJsonObject();
        JsonObject stats = json.getAsJsonObject("stats");

        assertSame(summary, response.getStats());
        assertSame(reportSummary, response.getReportSummary());
        assertFalse(json.has("warnings"));
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
        assertEquals(1200, json.getAsJsonObject("reportSummary").get("analyzedCodeSize").getAsInt());
    }

    @Test
    public void commandIdMatchesItsAcceptedKind() {
        RunAnalysisAction action = new RunAnalysisAction(inputKind);
        assertEquals(inputKind == AnalysisInput.Kind.SOURCE
                ? "java.spotbugs.analyzeSources" : "java.spotbugs.analyzeArtifacts", action.id());
    }

    @Test
    public void wrongMixedAndEmptyInputsAreRejectedBeforeAnalyzerCreation() {
        AtomicInteger analyzerCreations = new AtomicInteger();
        RunAnalysisAction action = new RunAnalysisAction(inputKind, () -> {
            analyzerCreations.incrementAndGet();
            return emptyAnalyzer();
        });
        String wrongKind = inputKind == AnalysisInput.Kind.SOURCE ? "artifact" : "source";
        String wrong = "{\"kind\":\"" + wrongKind + "\",\"path\":\"/workspace/wrong\"}";
        String matching = "{\"kind\":\"" + kindName() + "\",\"path\":\"/workspace/right\"}";
        for (String inputs : new String[] {"[]", "[" + wrong + "]",
                "[" + matching + "," + wrong + "]", "[" + wrong + "," + matching + "]"}) {
            JsonObject response = execute(action, "/workspace", "{\"inputs\":" + inputs + "}");
            assertEquals(inputs, "INVALID_ARGUMENT", firstError(response).get("code").getAsString());
            assertEquals(inputs, 0, response.getAsJsonArray("results").size());
            assertFalse(inputs, response.has("stats"));
        }
        assertEquals(0, analyzerCreations.get());
    }

    @Test
    public void multipleMatchingInputsReachSharedAnalyzerInOrderWithoutPathReclassification() {
        AtomicInteger executions = new AtomicInteger();
        String[] paths = {"/workspace/first.jar", "/workspace/second.java"};
        RunAnalysisAction action = new RunAnalysisAction(inputKind, () -> new AnalyzerService() {
            @Override
            public void setInputs(AnalysisInput[] inputs) {
                assertEquals(2, inputs.length);
                for (int index = 0; index < inputs.length; index++) {
                    assertEquals(inputKind, inputs[index].kind);
                    assertEquals(paths[index], inputs[index].path);
                }
                super.setInputs(inputs);
            }

            @Override
            public SpotBugsAnalysisResult analyzeToBugsWithWarnings(IProgressMonitor monitor, String... filePaths) {
                executions.incrementAndGet();
                assertEquals(1, filePaths.length);
                assertEquals("/workspace", filePaths[0]);
                return SpotBugsAnalysisResult.empty();
            }
        });
        com.google.gson.JsonArray inputs = new com.google.gson.JsonArray();
        for (String path : paths) {
            JsonObject input = new JsonObject();
            input.addProperty("kind", kindName());
            input.addProperty("path", path);
            inputs.add(input);
        }
        JsonObject payload = new JsonObject();
        payload.add("inputs", inputs);
        JsonObject response = execute(action, "/workspace", payload.toString());
        assertEquals(0, response.getAsJsonArray("errors").size());
        assertEquals(1, executions.get());
    }

    private String kindName() {
        return inputKind.name().toLowerCase(java.util.Locale.ROOT);
    }

    private JsonObject executeDefault(RunAnalysisAction action) {
        return execute(action, "/workspace/build/classes", "{}");
    }

    private JsonObject execute(RunAnalysisAction action, Object... args) {
        return executeWithMonitor(action, new NullProgressMonitor(), args);
    }

    private JsonObject executeWithMonitor(RunAnalysisAction action, IProgressMonitor monitor, Object... args) {
        if (args.length > 1 && args[0] instanceof String && args[1] instanceof String) {
            try {
                JsonObject payload = JsonParser.parseString((String) args[1]).getAsJsonObject();
                if (!payload.has("inputs")) {
                    JsonObject input = new JsonObject();
                    input.addProperty("kind", kindName());
                    input.addProperty("path", (String) args[0]);
                    com.google.gson.JsonArray inputs = new com.google.gson.JsonArray();
                    inputs.add(input);
                    payload.add("inputs", inputs);
                    args[1] = payload.toString();
                }
            } catch (RuntimeException invalidJson) { /* Exercise parser failures unchanged. */ }
        }
        String json = action.execute(args, monitor);
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
            public SpotBugsAnalysisResult analyzeToBugsWithWarnings(IProgressMonitor monitor, String... filePaths) {
                return SpotBugsAnalysisResult.empty();
            }
        };
    }

    private static final class CountingAnalyzerService extends AnalyzerService {
        @Override
        public SpotBugsAnalysisResult analyzeToBugsWithWarnings(IProgressMonitor monitor, String... filePaths) {
            return SpotBugsAnalysisResult.empty();
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
