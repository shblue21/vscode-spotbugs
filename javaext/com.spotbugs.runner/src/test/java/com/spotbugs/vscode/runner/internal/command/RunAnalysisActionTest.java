package com.spotbugs.vscode.runner.internal.command;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.Collections;
import java.util.concurrent.atomic.AtomicInteger;

import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.core.runtime.NullProgressMonitor;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.junit.runners.Parameterized;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.spotbugs.vscode.runner.api.AnalysisReportSummary;
import com.spotbugs.vscode.runner.api.BugInfo;
import com.spotbugs.vscode.runner.api.CommandWarning;
import com.spotbugs.vscode.runner.internal.AnalyzerService;
import com.spotbugs.vscode.runner.internal.config.AnalysisConfig;
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
        RunAnalysisAction action = new RunAnalysisAction(inputKind, config -> new AnalyzerService(config) {
            @Override
            public SpotBugsAnalysisResult analyzeToBugsWithWarnings(IProgressMonitor monitor, boolean includeBaselineXml, AnalysisInput[] inputs) {
                throw new RuntimeException("outer", new IllegalStateException("inner"));
            }
        });

        JsonObject response = execute(action, "/workspace/build/classes",
                validRequest("/workspace/build/classes").toString());
        JsonObject stats = response.getAsJsonObject("stats");

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
        RunAnalysisAction action = new RunAnalysisAction(inputKind, config -> new AnalyzerService(config) {
            @Override
            public SpotBugsAnalysisResult analyzeToBugsWithWarnings(IProgressMonitor monitor, boolean includeBaselineXml, AnalysisInput[] inputs) {
                throw new NoClassDefFoundError("missing detector dependency");
            }
        });

        JsonObject response = execute(action, "/workspace/build/classes",
                validRequest("/workspace/build/classes").toString());
        JsonObject stats = response.getAsJsonObject("stats");

        assertEquals("ANALYSIS_FAILED", firstError(response).get("code").getAsString());
        assertEquals("missing detector dependency", firstError(response).get("message").getAsString());
        assertEquals("/workspace/build/classes", stats.get("target").getAsString());
        assertTrue(stats.get("durationMs").getAsLong() >= 0L);
        assertEquals(0, stats.get("findingCount").getAsInt());
    }

    @Test
    public void executeReportsFindingsAndReportMetadata() {
        RunAnalysisAction action = new RunAnalysisAction(inputKind, config -> new AnalyzerService(config) {
            @Override
            public SpotBugsAnalysisResult analyzeToBugsWithWarnings(IProgressMonitor monitor,
                    boolean includeBaselineXml, AnalysisInput[] inputs) {
                assertTrue(includeBaselineXml);
                return new SpotBugsAnalysisResult(
                        Collections.nCopies(2, (BugInfo) null),
                        Collections.emptyList(),
                        new AnalysisReportSummary(1200, 4, 2),
                        "{\"version\":\"2.1.0\",\"runs\":[]}",
                        "<?xml version=\"1.0\"?><BugCollection/>",
                        Collections.singletonList("com.example.Missing")
                );
            }
        });

        JsonObject request = validRequest("/workspace/build/classes");
        request.addProperty("includeBaselineXml", true);
        JsonObject response = execute(action, "/workspace/build/classes", request.toString());

        assertEquals("com.example.Missing", response.getAsJsonArray("missingClasses").get(0).getAsString());
        assertFalse(response.has("warnings"));
        assertEquals(1200, response.getAsJsonObject("reportSummary").get("analyzedCodeSize").getAsInt());
        assertEquals(0, response.getAsJsonArray("errors").size());
        assertEquals(2, response.getAsJsonArray("results").size());
        assertEquals(2, response.getAsJsonObject("stats").get("findingCount").getAsInt());
        assertEquals("2.1.0", JsonParser.parseString(response.get("nativeSarif").getAsString())
                .getAsJsonObject().get("version").getAsString());
        assertTrue(response.get("baselineXml").getAsString().contains("BugCollection"));
    }

    @Test
    public void executeSerializesWarningsFromSuccessfulAnalysis() {
        RunAnalysisAction action = new RunAnalysisAction(inputKind, config -> new AnalyzerService(config) {
            @Override
            public SpotBugsAnalysisResult analyzeToBugsWithWarnings(IProgressMonitor monitor, boolean includeBaselineXml, AnalysisInput[] inputs) {
                return new SpotBugsAnalysisResult(
                        Collections.emptyList(),
                        Collections.singletonList(new CommandWarning(
                                "PLUGIN_CLEANUP_CLOSE_FAILED",
                                "Failed to close plugin com.example: close failed"
                        ))
                );
            }
        });

        JsonObject response = execute(action, "/workspace/build/classes",
                validRequest("/workspace/build/classes").toString());

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
        RunAnalysisAction action = new RunAnalysisAction(inputKind, config -> {
            analyzerCreations.incrementAndGet();
            return emptyAnalyzer(config);
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
        RunAnalysisAction action = new RunAnalysisAction(inputKind, config -> {
            analyzerCreations.incrementAndGet();
            return emptyAnalyzer(config);
        });

        JsonObject response = execute(action, "/workspace/build/classes", "{");

        assertEquals(0, response.getAsJsonArray("results").size());
        assertEquals("CFG_BAD_JSON", firstError(response).get("code").getAsString());
        assertEquals("Invalid config JSON", firstError(response).get("message").getAsString());
        assertFalse(response.has("stats"));
        assertEquals(0, analyzerCreations.get());
    }

    @Test
    public void executeReturnsCancelledEnvelopeWhenMonitorIsCancelledAfterAnalyzerReturns() {
        NullProgressMonitor monitor = new NullProgressMonitor();
        RunAnalysisAction action = new RunAnalysisAction(inputKind, config -> new AnalyzerService(config) {
            @Override
            public SpotBugsAnalysisResult analyzeToBugsWithWarnings(IProgressMonitor progressMonitor, boolean includeBaselineXml, AnalysisInput[] inputs) {
                progressMonitor.setCanceled(true);
                return SpotBugsAnalysisResult.empty();
            }
        });

        JsonObject response = executeWithMonitor(action, monitor, "/workspace/build/classes",
                validRequest("/workspace/build/classes").toString());

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
        RunAnalysisAction action = new RunAnalysisAction(inputKind, config -> {
            analyzerCreations.incrementAndGet();
            return emptyAnalyzer(config);
        });

        JsonObject response = executeWithMonitor(action, monitor, "/workspace/build/classes",
                validRequest("/workspace/build/classes").toString());

        assertEquals("ANALYSIS_CANCELLED", firstError(response).get("code").getAsString());
        assertEquals(0, analyzerCreations.get());
    }

    @Test
    public void executeReportsAllCurrentStatsKeysAndCounts() {
        RunAnalysisAction action = new RunAnalysisAction(inputKind, CountingAnalyzerService::new);
        JsonObject request = validRequest("/workspace/build/classes");
        request.add("targetResolutionRoots", JsonParser.parseString(
                "[\"/workspace/out-a\",\"/workspace/out-b\",\"/workspace/out-c\"]"));
        request.add("runtimeClasspaths", JsonParser.parseString("[\"/workspace/out-a\",\"/workspace/lib.jar\"]"));
        JsonArray extraAuxClasspaths = new JsonArray();
        extraAuxClasspaths.add(System.getProperty("java.io.tmpdir"));
        request.add("extraAuxClasspaths", extraAuxClasspaths);
        request.add("plugins", JsonParser.parseString("[\"/workspace/plugin-a.jar\",\"/workspace/plugin-b.jar\"]"));

        JsonObject response = execute(action, "/workspace/build/classes", request.toString());
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
    public void commandIdMatchesItsAcceptedKind() {
        RunAnalysisAction action = new RunAnalysisAction(inputKind);
        assertEquals(inputKind == AnalysisInput.Kind.SOURCE
                ? "java.spotbugs.analyzeSources" : "java.spotbugs.analyzeArtifacts", action.id());
    }

    @Test
    public void missingEmptyWrongAndMixedInputsAreRejectedBeforeAnalyzerCreation() {
        AtomicInteger analyzerCreations = new AtomicInteger();
        RunAnalysisAction action = new RunAnalysisAction(inputKind, config -> {
            analyzerCreations.incrementAndGet();
            return emptyAnalyzer(config);
        });
        String wrongKind = inputKind == AnalysisInput.Kind.SOURCE ? "artifact" : "source";
        String wrong = "{\"kind\":\"" + wrongKind + "\",\"path\":\"/workspace/wrong\"}";
        String matching = "{\"kind\":\"" + kindName() + "\",\"path\":\"/workspace/right\"}";
        for (String request : new String[] {"{}", "{\"inputs\":[]}",
                "{\"inputs\":[" + wrong + "]}", "{\"inputs\":[" + matching + "," + wrong + "]}",
                "{\"inputs\":[" + wrong + "," + matching + "]}"}) {
            JsonObject response = execute(action, "/workspace", request);
            assertEquals(request, "INVALID_ARGUMENT", firstError(response).get("code").getAsString());
            assertEquals(request, 0, response.getAsJsonArray("results").size());
            assertFalse(request, response.has("stats"));
        }
        assertEquals(0, analyzerCreations.get());
    }

    @Test
    public void multipleMatchingInputsReachSharedAnalyzerInOrderWithoutPathReclassification() {
        AtomicInteger executions = new AtomicInteger();
        String[] paths = {"/workspace/first.jar", "/workspace/second.java"};
        RunAnalysisAction action = new RunAnalysisAction(inputKind, config -> new AnalyzerService(config) {
            @Override
            public SpotBugsAnalysisResult analyzeToBugsWithWarnings(IProgressMonitor monitor,
                    boolean includeBaselineXml, AnalysisInput[] inputs) {
                executions.incrementAndGet();
                assertEquals(2, inputs.length);
                for (int index = 0; index < inputs.length; index++) {
                    assertEquals(inputKind, inputs[index].kind);
                    assertEquals(paths[index], inputs[index].path);
                }
                return SpotBugsAnalysisResult.empty();
            }
        });
        JsonObject response = execute(action, "/workspace", validRequest(paths).toString());
        assertEquals(0, response.getAsJsonArray("errors").size());
        assertEquals(1, executions.get());
        assertEquals("/workspace", response.getAsJsonObject("stats").get("target").getAsString());
    }

    private String kindName() {
        return inputKind.name().toLowerCase(java.util.Locale.ROOT);
    }

    private JsonObject validRequest(String... paths) {
        JsonArray inputs = new JsonArray();
        for (String path : paths) {
            JsonObject input = new JsonObject();
            input.addProperty("kind", kindName());
            input.addProperty("path", path);
            inputs.add(input);
        }
        JsonObject request = new JsonObject();
        request.add("inputs", inputs);
        return request;
    }

    private JsonObject execute(RunAnalysisAction action, Object... args) {
        return executeWithMonitor(action, new NullProgressMonitor(), args);
    }

    private JsonObject executeWithMonitor(RunAnalysisAction action, IProgressMonitor monitor, Object... args) {
        String json = action.execute(args, monitor);
        return JsonParser.parseString(json).getAsJsonObject();
    }

    private static JsonObject firstError(JsonObject response) {
        return response.getAsJsonArray("errors").get(0).getAsJsonObject();
    }

    private static AnalyzerService emptyAnalyzer(AnalysisConfig config) {
        return new AnalyzerService(config) {
            @Override
            public SpotBugsAnalysisResult analyzeToBugsWithWarnings(IProgressMonitor monitor, boolean includeBaselineXml, AnalysisInput[] inputs) {
                return SpotBugsAnalysisResult.empty();
            }
        };
    }

    private static final class CountingAnalyzerService extends AnalyzerService {
        private CountingAnalyzerService(AnalysisConfig config) {
            super(config);
        }

        @Override
        public SpotBugsAnalysisResult analyzeToBugsWithWarnings(IProgressMonitor monitor, boolean includeBaselineXml, AnalysisInput[] inputs) {
            return SpotBugsAnalysisResult.empty();
        }

        @Override
        public com.spotbugs.vscode.runner.internal.AnalysisPreparationStats getPreparationStats() {
            return new com.spotbugs.vscode.runner.internal.AnalysisPreparationStats(5, 7, 4);
        }
    }
}
