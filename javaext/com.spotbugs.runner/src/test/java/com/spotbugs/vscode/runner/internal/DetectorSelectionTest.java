package com.spotbugs.vscode.runner.internal;

import static org.junit.Assert.*;
import java.io.File;
import java.io.IOException;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.junit.Test;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.spotbugs.vscode.runner.api.BugInfo;
import com.spotbugs.vscode.runner.internal.config.AnalysisConfig;
import com.spotbugs.vscode.runner.internal.config.ConfigParser;
import com.spotbugs.vscode.runner.internal.config.ConfigValidator;
import com.spotbugs.vscode.runner.internal.fixtures.NegativeShiftFixture;
import com.spotbugs.vscode.runner.internal.fixtures.Struts2EndpointFixture;
import edu.umd.cs.findbugs.DetectorFactory;
import edu.umd.cs.findbugs.FindBugs2;
import edu.umd.cs.findbugs.Plugin;
import edu.umd.cs.findbugs.config.UserPreferences;
import edu.umd.cs.findbugs.detect.FindPuzzlers;

public class DetectorSelectionTest {
    private final SpotBugsExecutor executor = new SpotBugsExecutor();

    private static final String CORE = "edu.umd.cs.findbugs.detect.FindPuzzlers";
    private static final String CUSTOM = "com.h3xstream.findsecbugs.endpoint.Struts2EndpointDetector";
    private static final String PLUGIN_ID = "com.h3xstream.findsecbugs";

    @Test public void coreOverrideChangesFindingsAndDoesNotLeakIntoNextExecution() throws Exception {
        assertTrue(hasBug(analyze(NegativeShiftFixture.class, config(null, null)), "ICAST_BAD_SHIFT_AMOUNT"));
        assertFalse(hasBug(analyze(NegativeShiftFixture.class, config(false, null)), "ICAST_BAD_SHIFT_AMOUNT"));
        assertTrue(hasBug(analyze(NegativeShiftFixture.class, config(true, null)), "ICAST_BAD_SHIFT_AMOUNT"));
        assertTrue(hasBug(analyze(NegativeShiftFixture.class, config(null, null)), "ICAST_BAD_SHIFT_AMOUNT"));
    }

    @Test public void externalOverrideChangesFindingsAndDoesNotLeakIntoNextExecution() throws Exception {
        JsonObject defaults = json(null, true);
        defaults.getAsJsonArray("plugins").get(0).getAsJsonObject().add("detectors", new JsonObject());
        assertTrue(hasBug(analyze(Struts2EndpointFixture.class, parse(defaults)), "STRUTS2_ENDPOINT"));
        assertFalse(hasBug(analyze(Struts2EndpointFixture.class, config(null, false)), "STRUTS2_ENDPOINT"));
        assertTrue(hasBug(analyze(Struts2EndpointFixture.class, parse(defaults)), "STRUTS2_ENDPOINT"));
        assertTrue(hasBug(analyze(Struts2EndpointFixture.class, config(null, true)), "STRUTS2_ENDPOINT"));
        assertNull(Plugin.getByPluginId(PLUGIN_ID));
    }

    @Test public void unresolvedActiveOverrideFailsBeforeExecutionAndCleansUpPlugins() throws Exception {
        JsonObject json = json(null, true);
        json.getAsJsonArray("plugins").get(0).getAsJsonObject().getAsJsonObject("detectors").addProperty("missing.Detector", false);
        boolean[] closed = { false };
        FindBugs2 engine = new FindBugs2() {
            @Override public void execute() {
                fail("Invalid detector selection must fail before engine execution");
            }
            @Override public void close() {
                closed[0] = true;
                super.close();
            }
        };
        try {
            new SpotBugsExecutor(() -> engine, PluginLifecycle.DEFAULT).execute(
                    ExecutorTestSupport.input(), parse(json).getExecutionOptions(), null, false);
            fail("Unknown active override must fail");
        } catch (IOException expected) {
            assertTrue(expected.getMessage().contains("Unknown detector override"));
        }
        assertTrue("The executor must close its engine after selection failure", closed[0]);
        assertNull(engine.getProject());
        assertNull(Plugin.getByPluginId(PLUGIN_ID));
        assertTrue(hasBug(analyze(Struts2EndpointFixture.class, config(null, true)), "STRUTS2_ENDPOINT"));
    }

    @Test public void checksShortNameCollisionsOnlyForTouchedOverrides() throws Exception {
        UserPreferences preferences = UserPreferences.createDefaultUserPreferences();
        Plugin core = Plugin.getAllPlugins().stream().filter(Plugin::isCorePlugin).findFirst().get();
        DetectorFactory first = new DetectorFactory(core, "first.Check", FindPuzzlers.class, true, "fast", "", "");
        DetectorFactory second = new DetectorFactory(core, "second.Check", FindPuzzlers.class, true, "fast", "", "");
        List<DetectorFactory> factories = Arrays.asList(first, second);
        DetectorSelection.applyOverrides(preferences, Collections.emptyMap(), Collections.singletonList(first), factories);
        try {
            DetectorSelection.applyOverrides(preferences, Collections.singletonMap("first.Check", false), Collections.singletonList(first), factories);
            fail("Touched short-name collision must fail");
        } catch (IOException expected) { assertTrue(expected.getMessage().contains("colliding")); }
        try {
            DetectorSelection.applyOverrides(preferences, Collections.singletonMap("second.Check", false), Collections.singletonList(first), factories);
            fail("Override must belong to the selected plugin");
        } catch (IOException expected) { assertTrue(expected.getMessage().contains("Unknown")); }
    }

    @Test public void cancellationAfterPluginLoadingReleasesTheRuntimeScope() throws Exception {
        org.eclipse.core.runtime.NullProgressMonitor monitor = new org.eclipse.core.runtime.NullProgressMonitor();
        FindBugs2 engine = new FindBugs2() {
            @Override public void execute() {
                assertNotNull(Plugin.getByPluginId(PLUGIN_ID));
                monitor.setCanceled(true);
            }
        };
        AnalysisConfig config = config(null, false);
        try {
            new SpotBugsExecutor(() -> engine, PluginLifecycle.DEFAULT).execute(
                    ExecutorTestSupport.input(), config.getExecutionOptions(), monitor, false);
            fail("Expected cancellation after loading");
        } catch (java.util.concurrent.CancellationException expected) {
            assertNull(Plugin.getByPluginId(PLUGIN_ID));
        }
        assertTrue(hasBug(analyze(Struts2EndpointFixture.class, config(null, true)), "STRUTS2_ENDPOINT"));
    }

    @Test public void rejectsNonBooleanDetectorValuesAtTheWireBoundary() {
        for (String value : Arrays.asList("\"false\"", "0", "null", "[]")) {
            assertTrue(new ConfigParser().parse("{\"detectors\":{\"example.Check\":" + value + "}}").hasError());
            assertTrue(new ConfigParser().parse("{\"plugins\":[{\"path\":\"check.jar\",\"detectors\":{\"example.Check\":" + value + "}}]}").hasError());
        }
        assertTrue(new ConfigParser().parse("{\"plugins\":[\"old.jar\"]}").hasError());
        assertTrue(new ConfigParser().parse("{\"plugins\":[{\"path\":123}]}").hasError());
    }

    private AnalysisConfig config(Boolean core, Boolean custom) throws Exception { return parse(json(core, custom)); }
    private AnalysisConfig parse(JsonObject json) {
        var parsed = new ConfigParser().parse(json.toString());
        assertFalse(parsed.hasError());
        var validated = new ConfigValidator().validate(parsed.getSchema());
        assertFalse(validated.hasError());
        return validated.getConfig();
    }
    private JsonObject json(Boolean core, Boolean custom) throws Exception {
        JsonObject json = new JsonObject();
        json.addProperty("priorityThreshold", 20);
        json.addProperty("minimumConfidence", "low");
        if (core != null) {
            JsonObject detectors = new JsonObject(); detectors.addProperty(CORE, core); json.add("detectors", detectors);
        }
        if (custom != null) {
            JsonObject registration = new JsonObject();
            registration.addProperty("path", new File("target/test-plugins/findsecbugs-plugin-1.11.0.jar").getCanonicalPath());
            JsonObject detectors = new JsonObject(); detectors.addProperty(CUSTOM, custom); registration.add("detectors", detectors);
            JsonArray registrations = new JsonArray(); registrations.add(registration); json.add("plugins", registrations);
        }
        return json;
    }
    private List<BugInfo> analyze(Class<?> fixture, AnalysisConfig config) throws Exception {
        String path = new File(fixture.getResource(fixture.getSimpleName() + ".class").toURI()).getAbsolutePath();
        return executor.execute(ExecutorTestSupport.input(path), config.getExecutionOptions(), null, false).getBugs();
    }
    private boolean hasBug(List<BugInfo> bugs, String type) {
        return bugs.stream().anyMatch(bug -> type.equals(bug.getType()));
    }
}
