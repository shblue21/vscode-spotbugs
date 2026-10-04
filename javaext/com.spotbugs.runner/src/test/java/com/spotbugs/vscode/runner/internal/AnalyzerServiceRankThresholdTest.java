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

    @Test
    public void structuredResultsUseExactRankThreshold() throws Exception {
        assertStructuredPresence(5, false);
        assertStructuredPresence(6, true);
        assertStructuredPresence(9, true);

        List<BugInfo> thresholdTwenty = analyzeBugs(20);
        BugInfo fixtureBug = onlyFixtureBug(thresholdTwenty);
        assertEquals(6, fixtureBug.getRank());
        assertEquals("Low", fixtureBug.getPriority());

        assertStructuredPresence(null, false);
    }

    @Test
    public void confidenceAndRankApplyToAllReports() throws Exception {
        String[] confidences = { "default", "high", "medium", "low", "low", "default", "low" };
        Integer[] ranks = { 6, 6, 6, 6, 5, null, null };
        int[] counts = { 1, 0, 0, 1, 0, 0, 1 };
        for (int i = 0; i < confidences.length; i++) {
            AnalyzerService analyzer = new AnalyzerService();
            analyzer.setConfiguration(config(ranks[i], confidences[i]));
            SpotBugsAnalysisResult result = analyzer.analyzeToBugsWithWarnings(null, true, fixtureInputs());
            assertEquals(counts[i], result.getBugs().size());
            assertEquals(counts[i], JsonParser.parseString(result.getNativeSarif()).getAsJsonObject()
                    .getAsJsonArray("runs").get(0).getAsJsonObject().getAsJsonArray("results").size());
            assertEquals(counts[i] != 0, result.getBaselineXml().contains("type=\"" + BUG_TYPE + "\""));
        }
    }

    @Test
    public void nativeSarifUsesExactRankThreshold() throws Exception {
        assertNativeSarifPresence(5, false);
        assertNativeSarifPresence(6, true);
        assertNativeSarifPresence(9, true);
        assertNativeSarifPresence(20, true);
        assertNativeSarifPresence(null, false);
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
        assertEquals(1, analyzer.getLastTargetCount());
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

    private void assertStructuredPresence(Integer threshold, boolean expected) throws Exception {
        long count = analyzeBugs(threshold).stream()
                .filter(bug -> BUG_TYPE.equals(bug.getType()))
                .count();
        assertEquals(message("structured results", threshold), expected ? 1L : 0L, count);
    }

    private void assertNativeSarifPresence(Integer threshold, boolean expected) throws Exception {
        AnalyzerService analyzer = configuredAnalyzer(threshold);
        SpotBugsAnalysisResult analysis = analyzer.analyzeToBugsWithWarnings(null, false, fixtureInputs());
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
    }

    private List<BugInfo> analyzeBugs(Integer threshold) throws Exception {
        return configuredAnalyzer(threshold).analyzeToBugsWithWarnings(null, false, fixtureInputs()).getBugs();
    }

    private AnalysisInput[] fixtureInputs() throws Exception {
        return new AnalysisInput[] { new AnalysisInput(AnalysisInput.Kind.ARTIFACT, fixtureClassPath()) };
    }

    private AnalyzerService configuredAnalyzer(Integer threshold) {
        AnalyzerService analyzer = new AnalyzerService();
        analyzer.setConfiguration(config(threshold, null));
        return analyzer;
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
