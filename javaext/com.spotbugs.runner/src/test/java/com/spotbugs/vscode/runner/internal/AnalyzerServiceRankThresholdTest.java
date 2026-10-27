package com.spotbugs.vscode.runner.internal;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.junit.Test;
import org.eclipse.core.runtime.NullProgressMonitor;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.spotbugs.vscode.runner.api.AnalysisReportSummary;
import com.spotbugs.vscode.runner.api.BugInfo;
import com.spotbugs.vscode.runner.internal.config.AnalysisConfig;
import com.spotbugs.vscode.runner.internal.config.ConfigParseResult;
import com.spotbugs.vscode.runner.internal.config.ConfigParser;
import com.spotbugs.vscode.runner.internal.config.ConfigValidationResult;
import com.spotbugs.vscode.runner.internal.config.ConfigValidator;
import com.spotbugs.vscode.runner.internal.fixtures.NegativeShiftFixture;

import edu.umd.cs.findbugs.ExcludingHashesBugReporter;

public class AnalyzerServiceRankThresholdTest {

    private static final String BUG_TYPE = "ICAST_BAD_SHIFT_AMOUNT";

    @Test(expected = NullPointerException.class)
    public void configurationIsRequiredAtConstruction() {
        new AnalyzerService(null);
    }

    @Test
    public void configuredServicesKeepIndependentThresholds() throws Exception {
        AnalyzerService defaultAnalyzer = new AnalyzerService(config(null, null));
        AnalyzerService customAnalyzer = new AnalyzerService(config(20, "low"));
        assertTrue(defaultAnalyzer.analyzeToBugsWithWarnings(null, false, fixtureInputs()).getBugs().isEmpty());
        assertEquals(BUG_TYPE, onlyFixtureBug(
                customAnalyzer.analyzeToBugsWithWarnings(null, false, fixtureInputs()).getBugs()).getType());
        assertTrue(defaultAnalyzer.analyzeToBugsWithWarnings(null, false, fixtureInputs()).getBugs().isEmpty());
        assertEquals(1, defaultAnalyzer.getPreparationStats().getTargetCount());
    }

    @Test
    public void structuredAndNativeSarifUseExactRankThreshold() throws Exception {
        assertReportPresence(0, false);
        assertReportPresence(99, true);
        assertReportPresence(5, false);
        assertReportPresence(6, true);
        assertReportPresence(9, true);

        List<BugInfo> thresholdTwenty = assertReportPresence(20, true).getBugs();
        BugInfo fixtureBug = onlyFixtureBug(thresholdTwenty);
        assertEquals(6, fixtureBug.getRank());
        assertEquals("Low", fixtureBug.getPriority());

        assertReportPresence(null, false);
    }

    @Test
    public void confidenceAndRankApplyToAllReports() throws Exception {
        String[] confidences = { "default", "high", "medium", "low", "low", "default", "low" };
        Integer[] ranks = { 6, 6, 6, 6, 5, null, null };
        int[] counts = { 1, 0, 0, 1, 0, 0, 1 };
        for (int i = 0; i < confidences.length; i++) {
            AnalyzerService analyzer = new AnalyzerService(config(ranks[i], confidences[i]));
            SpotBugsAnalysisResult result = analyzer.analyzeToBugsWithWarnings(null, true, fixtureInputs());
            assertEquals(counts[i], result.getBugs().size());
            assertEquals(counts[i], JsonParser.parseString(result.getNativeSarif()).getAsJsonObject()
                    .getAsJsonArray("runs").get(0).getAsJsonObject().getAsJsonArray("results").size());
            assertEquals(counts[i] != 0, result.getBaselineXml().contains("type=\"" + BUG_TYPE + "\""));
        }
    }

    @Test
    public void structuredResultIncludesPlainReportData() throws Exception {
        AnalysisInput[] inputs = fixtureInputs();
        AnalyzerService analyzer = configuredAnalyzer(20);
        SpotBugsAnalysisResult result = analyzer.analyzeToBugsWithWarnings(
                new NullProgressMonitor() {
                    @Override
                    public boolean isCanceled() {
                        inputs[0] = new AnalysisInput(AnalysisInput.Kind.ARTIFACT, "/missing.class");
                        return false;
                    }
                }, true, inputs);
        assertEquals(1, analyzer.getPreparationStats().getTargetCount());
        AnalysisReportSummary summary = result.getReportSummary();
        BugInfo fixtureBug = onlyFixtureBug(result.getBugs());

        assertNotNull(summary);
        assertEquals(1, summary.getAnalyzedClassCount());
        assertEquals(1, summary.getAnalyzedPackageCount());
        assertTrue(summary.getAnalyzedCodeSize() > 0);
        assertNotNull(fixtureBug.getLongMessage());
        assertNotNull(fixtureBug.getCategoryDescription());
        assertFalse(fixtureBug.getAnnotationMessages().isEmpty());
        String baselineXml = result.getBaselineXml();
        assertNotNull(baselineXml);
        assertFalse(baselineXml.contains(fixtureClassPath()));
        assertFalse(baselineXml.contains(fixtureSourceRoot().getAbsolutePath()));

        Path baseline = Files.createTempFile("spotbugs-baseline", ".xml");
        try {
            Files.writeString(baseline, baselineXml);
            Set<String> hashes = new HashSet<>();
            ExcludingHashesBugReporter.addToExcludedInstanceHashes(hashes, baseline.toString());
            for (BugInfo bug : result.getBugs()) {
                assertTrue(hashes.contains(bug.getInstanceHash()));
            }
        } finally {
            Files.deleteIfExists(baseline);
        }
    }

    @Test
    public void ownedEngineAppliesIncludeExcludeAndBaselineFiltersToAllReports() throws Exception {
        String baselineXml = configuredAnalyzer(20)
                .analyzeToBugsWithWarnings(null, true, fixtureInputs()).getBaselineXml();
        Path directory = Files.createTempDirectory("spotbugs-owned-filters");
        Path include = directory.resolve("include.xml");
        Path exclude = directory.resolve("exclude.xml");
        Path baseline = directory.resolve("baseline.xml");
        try {
            Files.writeString(include, "<FindBugsFilter><Match><Bug pattern=\"NP_ALWAYS_NULL\"/></Match></FindBugsFilter>");
            Files.writeString(exclude, "<FindBugsFilter><Match><Bug pattern=\"" + BUG_TYPE
                    + "\"/></Match></FindBugsFilter>");
            Files.writeString(baseline, baselineXml);
            String[] fields = { "includeFilterPaths", "excludeFilterPaths", "excludeBaselineBugsPaths" };
            Path[] paths = { include, exclude, baseline };
            for (int i = 0; i < fields.length; i++) {
                JsonObject json = new JsonObject();
                json.addProperty("priorityThreshold", 20);
                JsonArray filters = new JsonArray();
                filters.add(paths[i].toString());
                json.add(fields[i], filters);
                AnalysisConfig config = new ConfigValidator().validate(
                        new ConfigParser().parse(json.toString()).getSchema()).getConfig();
                SpotBugsAnalysisResult result = new AnalyzerService(config)
                        .analyzeToBugsWithWarnings(null, true, fixtureInputs());
                assertTrue(fields[i], result.getBugs().isEmpty());
                assertEquals(fields[i], 0, JsonParser.parseString(result.getNativeSarif()).getAsJsonObject()
                        .getAsJsonArray("runs").get(0).getAsJsonObject().getAsJsonArray("results").size());
                assertFalse(fields[i], result.getBaselineXml().contains("type=\"" + BUG_TYPE + "\""));
            }
        } finally {
            Files.deleteIfExists(include);
            Files.deleteIfExists(exclude);
            Files.deleteIfExists(baseline);
            Files.deleteIfExists(directory);
        }
    }

    private SpotBugsAnalysisResult assertReportPresence(Integer threshold, boolean expected) throws Exception {
        AnalyzerService analyzer = configuredAnalyzer(threshold);
        SpotBugsAnalysisResult analysis = analyzer.analyzeToBugsWithWarnings(null, false, fixtureInputs());
        long structuredCount = analysis.getBugs().stream()
                .filter(bug -> BUG_TYPE.equals(bug.getType()))
                .count();
        assertEquals(message("structured results", threshold), expected ? 1L : 0L, structuredCount);
        String sarif = analysis.getNativeSarif();
        assertNull(analysis.getBaselineXml());
        assertNotNull(message("native SARIF", threshold), sarif);
        assertFalse(message("native SARIF", threshold), sarif.trim().isEmpty());

        JsonObject run = JsonParser.parseString(sarif)
                .getAsJsonObject()
                .getAsJsonArray("runs")
                .get(0)
                .getAsJsonObject();
        JsonArray results = run.getAsJsonArray("results");
        assertEquals(analysis.getBugs().size(), results.size());
        int count = 0;
        for (int index = 0; index < results.size(); index++) {
            JsonElement element = results.get(index);
            JsonObject result = element.getAsJsonObject();
            assertEquals(analysis.getBugs().get(index).getType(), result.get("ruleId").getAsString());
            if (BUG_TYPE.equals(result.get("ruleId").getAsString())) {
                count++;
            }
        }
        assertEquals(message("native SARIF", threshold), expected ? 1 : 0, count);
        if (expected) {
            JsonObject artifact = results.get(0).getAsJsonObject()
                    .getAsJsonArray("locations").get(0).getAsJsonObject()
                    .getAsJsonObject("physicalLocation")
                    .getAsJsonObject("artifactLocation");
            String baseId = artifact.get("uriBaseId").getAsString();
            String baseUri = run.getAsJsonObject("originalUriBaseIds")
                    .getAsJsonObject(baseId).get("uri").getAsString();
            assertEquals(fixtureSourceRoot().toURI().toString(), baseUri);
        }
        return analysis;
    }

    private AnalysisInput[] fixtureInputs() throws Exception {
        return new AnalysisInput[] { new AnalysisInput(AnalysisInput.Kind.ARTIFACT, fixtureClassPath()) };
    }

    private AnalyzerService configuredAnalyzer(Integer threshold) {
        return new AnalyzerService(config(threshold, null));
    }

    private AnalysisConfig config(Integer threshold, String confidence) {
        JsonObject json = new JsonObject();
        if (confidence != null) json.addProperty("minimumConfidence", confidence);
        if (threshold != null) {
            json.addProperty("priorityThreshold", threshold);
        }
        JsonArray sourcepaths = new JsonArray();
        sourcepaths.add(fixtureSourceRoot().getAbsolutePath());
        json.add("sourcepaths", sourcepaths);
        ConfigParseResult parsed = new ConfigParser().parse(json.toString());
        assertFalse(parsed.hasError());

        ConfigValidationResult validated = new ConfigValidator().validate(parsed.getSchema());
        assertFalse(validated.hasError());
        return validated.getConfig();
    }

    private File fixtureSourceRoot() {
        return new File(System.getProperty("basedir"), "src/test/java").getAbsoluteFile();
    }

    private BugInfo onlyFixtureBug(List<BugInfo> bugs) {
        BugInfo fixtureBug = null;
        for (BugInfo bug : bugs) {
            if (!BUG_TYPE.equals(bug.getType())) {
                continue;
            }
            assertNull("Fixture should produce exactly one " + BUG_TYPE, fixtureBug);
            fixtureBug = bug;
        }
        assertNotNull("Fixture should produce " + BUG_TYPE, fixtureBug);
        return fixtureBug;
    }

    private String fixtureClassPath() throws Exception {
        URL classFile = NegativeShiftFixture.class.getResource("NegativeShiftFixture.class");
        assertNotNull("Compiled negative-shift fixture should be available", classFile);
        return new File(classFile.toURI()).getAbsolutePath();
    }

    private String message(String output, Integer threshold) {
        return output + " should honor rank threshold " + String.valueOf(threshold);
    }
}
