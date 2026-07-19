package com.spotbugs.vscode.runner.internal;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.jar.JarEntry;
import java.util.jar.JarOutputStream;

import com.spotbugs.vscode.runner.api.CommandWarning;

import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import edu.umd.cs.findbugs.DetectorFactoryCollection;
import edu.umd.cs.findbugs.FindBugs2;
import edu.umd.cs.findbugs.Plugin;
import edu.umd.cs.findbugs.PluginException;
import edu.umd.cs.findbugs.Project;
import edu.umd.cs.findbugs.classfile.ClassDescriptor;

public class SpotBugsExecutorPluginLoadingTest {

    private static final String FINDSECBUGS_PLUGIN_ID = "com.h3xstream.findsecbugs";
    private static final String FINDSECBUGS_DETECTOR = "com.h3xstream.findsecbugs.PredictableRandomDetector";
    private static final String FINDSECBUGS_BUG_PATTERN = "PREDICTABLE_RANDOM";

    @Rule
    public TemporaryFolder temp = new TemporaryFolder();

    @Before
    public void resetSpotBugsStateBefore() {
        resetSpotBugsState();
    }

    @After
    public void resetSpotBugsStateAfter() {
        resetSpotBugsState();
    }

    @Test
    public void executeRegistersConfiguredPluginDetectorsBeforeRunningSpotBugs() throws Exception {
        CapturingFindBugs findBugs = new CapturingFindBugs(
                FINDSECBUGS_PLUGIN_ID,
                FINDSECBUGS_DETECTOR,
                FINDSECBUGS_BUG_PATTERN
        );
        Project project = new Project();
        SpotBugsExecutor executor = new SpotBugsExecutor(
                findBugs,
                project,
                3,
                Collections.singletonList(findSecBugsPluginJar().getAbsolutePath())
        );

        executor.executeBugs();

        assertTrue(findBugs.wasExecuted());
        assertNull(
                "FindSecBugs plugin should not leak after analysis completes",
                Plugin.getByPluginId(FINDSECBUGS_PLUGIN_ID)
        );
    }

    @Test
    public void failedPluginLoadDoesNotBlockLaterPluginWithSameId() throws Exception {
        String pluginId = "com.spotbugs.vscode.test.partial." + System.nanoTime();
        File invalidPlugin = createPluginJar(pluginId, "invalid-plugin.jar", true);
        File validPlugin = createPluginJar(pluginId, "valid-plugin.jar", false);

        try {
            new SpotBugsExecutor(
                    new CapturingFindBugs(pluginId),
                    new Project(),
                    3,
                    Collections.singletonList(invalidPlugin.getAbsolutePath())
            ).executeBugs();
            fail("Expected invalid plugin jar to fail analysis");
        } catch (IOException expected) {
            assertNull("Failed plugin should not be globally registered", Plugin.getByPluginId(pluginId));
        }

        CapturingFindBugs retryFindBugs = new CapturingFindBugs(pluginId);
        new SpotBugsExecutor(
                retryFindBugs,
                new Project(),
                3,
                Collections.singletonList(validPlugin.getAbsolutePath())
        ).executeBugs();

        assertTrue(retryFindBugs.wasExecuted());
        assertNull("Retried plugin should not leak after analysis completes", Plugin.getByPluginId(pluginId));
    }

    @Test
    public void linkageErrorDuringPluginLoadDoesNotBlockRetry() throws Exception {
        String pluginId = "com.spotbugs.vscode.test.linkage." + System.nanoTime();
        File pluginJar = createPluginJar(pluginId, "linkage-error-plugin.jar", false);

        try {
            new SpotBugsExecutor(
                    new CapturingFindBugs(pluginId),
                    new Project(),
                    3,
                    Collections.singletonList(pluginJar.getAbsolutePath()),
                    new LinkageFailingLifecycle()
            ).executeBugs();
            fail("Expected plugin linkage error to fail analysis");
        } catch (IOException expected) {
            assertTrue(expected.getCause() instanceof UnsupportedClassVersionError);
            assertNull("Failed plugin should not be globally registered", Plugin.getByPluginId(pluginId));
        }

        CapturingFindBugs retryFindBugs = new CapturingFindBugs(pluginId);
        new SpotBugsExecutor(
                retryFindBugs,
                new Project(),
                3,
                Collections.singletonList(pluginJar.getAbsolutePath())
        ).executeBugs();

        assertTrue(retryFindBugs.wasExecuted());
        assertNull("Retried plugin should not leak after analysis completes", Plugin.getByPluginId(pluginId));
    }

    @Test
    public void closeOnlyCleanupFailureReturnsWarningAndDoesNotBlockLaterPluginLoad() throws Exception {
        File pluginJar = findSecBugsPluginJar();
        SpotBugsExecutor executor = new SpotBugsExecutor(
                new CapturingFindBugs(FINDSECBUGS_PLUGIN_ID),
                new Project(),
                3,
                Collections.singletonList(pluginJar.getAbsolutePath()),
                new CloseFailingLifecycle()
        );

        SpotBugsAnalysisResult result = executor.executeBugsWithWarnings();

        List<CommandWarning> warnings = result.getWarnings();
        assertEquals(1, warnings.size());
        assertEquals("PLUGIN_CLEANUP_CLOSE_FAILED", warnings.get(0).getCode());
        assertTrue(warnings.get(0).getMessage().contains(FINDSECBUGS_PLUGIN_ID));
        assertTrue(warnings.get(0).getMessage().contains("close failed"));
        assertNull("Plugin should not remain globally registered after close warning", Plugin.getByPluginId(FINDSECBUGS_PLUGIN_ID));

    }

    @Test
    public void missingClassesReturnIncompleteWarning() throws Exception {
        SpotBugsAnalysisResult result = new SpotBugsExecutor(
                new FindBugs2() {
                    @Override
                    public void execute() {
                        getBugReporter().reportMissingClass(
                                ClassDescriptor.createClassDescriptor("com/example/MissingDependency")
                        );
                    }
                },
                new Project(),
                3,
                Collections.emptyList()
        ).executeBugsWithWarnings();

        assertEquals(1, result.getWarnings().size());
        assertEquals("ANALYSIS_INCOMPLETE", result.getWarnings().get(0).getCode());
    }

    @Test
    public void closeFailureBeforeLaterRemoveFailureIsSuppressedOnTerminalFailure() throws Exception {
        String removeFailurePluginId = "com.spotbugs.vscode.test.remove." + System.nanoTime();
        String closeFailurePluginId = "com.spotbugs.vscode.test.close." + System.nanoTime();
        File removeFailurePlugin = createPluginJar(removeFailurePluginId, "remove-failure-plugin.jar", false);
        File closeFailurePlugin = createPluginJar(closeFailurePluginId, "close-failure-plugin.jar", false);
        RuntimeException removeFailure = new RuntimeException("remove failed");
        IOException closeFailure = new IOException("close failed");

        try {
            new SpotBugsExecutor(
                    new CapturingFindBugs(removeFailurePluginId),
                    new Project(),
                    3,
                    Arrays.asList(
                            removeFailurePlugin.getAbsolutePath(),
                            closeFailurePlugin.getAbsolutePath()
                    ),
                    new TargetedFailingLifecycle(removeFailurePluginId, removeFailure, closeFailurePluginId, closeFailure)
            ).executeBugsWithWarnings();
            fail("Expected plugin removal failure to fail analysis");
        } catch (RuntimeException expected) {
            assertTrue("Terminal failure should be remove failure", expected == removeFailure);
            assertSuppressed(expected, closeFailure);
        } finally {
            removePluginIfLoaded(removeFailurePluginId);
            removePluginIfLoaded(closeFailurePluginId);
        }
    }

    private static File findSecBugsPluginJar() {
        File jar = new File(System.getProperty(
                "findsecbugs.plugin.jar",
                "target/test-plugins/findsecbugs-plugin-1.11.0.jar"
        ));
        assertTrue("FindSecBugs test plugin jar should exist: " + jar.getAbsolutePath(), jar.isFile());
        return jar;
    }

    private static void resetSpotBugsState() {
        Plugin existing = Plugin.getByPluginId(FINDSECBUGS_PLUGIN_ID);
        if (existing != null) {
            Plugin.removeCustomPlugin(existing);
            try {
                existing.close();
            } catch (IOException ignored) {
            }
        }
        DetectorFactoryCollection.resetInstance(null);
    }

    private static void removePluginIfLoaded(String pluginId) {
        Plugin existing = Plugin.getByPluginId(pluginId);
        if (existing != null) {
            Plugin.removeCustomPlugin(existing);
            try {
                existing.close();
            } catch (IOException ignored) {
            }
        }
    }

    private static void assertSuppressed(Throwable failure, Throwable suppressed) {
        for (Throwable candidate : failure.getSuppressed()) {
            if (candidate == suppressed) {
                return;
            }
        }
        fail("Expected suppressed failure: " + suppressed);
    }

    private File createPluginJar(String pluginId, String fileName, boolean includeMissingDetector) throws IOException {
        File jar = temp.newFile(fileName);
        try (JarOutputStream out = new JarOutputStream(new FileOutputStream(jar))) {
            writeJarEntry(out, "findbugs.xml", findbugsXml(pluginId, includeMissingDetector));
            writeJarEntry(out, "messages.xml", messagesXml());
        }
        return jar;
    }

    private static void writeJarEntry(JarOutputStream out, String name, String content) throws IOException {
        out.putNextEntry(new JarEntry(name));
        out.write(content.getBytes(StandardCharsets.UTF_8));
        out.closeEntry();
    }

    private static String findbugsXml(String pluginId, boolean includeMissingDetector) {
        String detector = includeMissingDetector
                ? "<Detector class=\"com.spotbugs.vscode.test.MissingDetector\" reports=\"TEST_MISSING\"/>"
                : "";
        return "<FindbugsPlugin pluginid=\"" + pluginId + "\" provider=\"SpotBugs Runner Test\" defaultenabled=\"true\">"
                + detector
                + "</FindbugsPlugin>";
    }

    private static String messagesXml() {
        return "<MessageCollection>"
                + "<Plugin>"
                + "<ShortDescription>SpotBugs runner test plugin</ShortDescription>"
                + "<Details>SpotBugs runner test plugin</Details>"
                + "</Plugin>"
                + "</MessageCollection>";
    }

    private static final class CloseFailingLifecycle implements PluginLifecycle {

        @Override
        public void closePlugin(Plugin plugin) throws IOException {
            throw new IOException("close failed");
        }
    }

    private static final class LinkageFailingLifecycle implements PluginLifecycle {

        @Override
        public Plugin loadCustomPlugin(File pluginJar, Project project) throws PluginException {
            PluginLifecycle.super.loadCustomPlugin(pluginJar, project);
            throw new UnsupportedClassVersionError("unsupported class version");
        }
    }

    private static final class TargetedFailingLifecycle implements PluginLifecycle {

        private final String removeFailurePluginId;
        private final RuntimeException removeFailure;
        private final String closeFailurePluginId;
        private final IOException closeFailure;

        private TargetedFailingLifecycle(
                String removeFailurePluginId,
                RuntimeException removeFailure,
                String closeFailurePluginId,
                IOException closeFailure
        ) {
            this.removeFailurePluginId = removeFailurePluginId;
            this.removeFailure = removeFailure;
            this.closeFailurePluginId = closeFailurePluginId;
            this.closeFailure = closeFailure;
        }

        @Override
        public void removeCustomPlugin(Plugin plugin) {
            if (removeFailurePluginId.equals(plugin.getPluginId())) {
                throw removeFailure;
            }
            PluginLifecycle.super.removeCustomPlugin(plugin);
        }

        @Override
        public void closePlugin(Plugin plugin) throws IOException {
            if (closeFailurePluginId.equals(plugin.getPluginId())) {
                throw closeFailure;
            }
            PluginLifecycle.super.closePlugin(plugin);
        }
    }

    private static final class CapturingFindBugs extends FindBugs2 {

        private final String expectedPluginId;
        private final String expectedDetectorClassName;
        private final String expectedBugPattern;
        private DetectorFactoryCollection detectorFactoryCollection;
        private boolean executed;

        private CapturingFindBugs(String expectedPluginId) {
            this(expectedPluginId, null, null);
        }

        private CapturingFindBugs(String expectedPluginId, String expectedDetectorClassName, String expectedBugPattern) {
            this.expectedPluginId = expectedPluginId;
            this.expectedDetectorClassName = expectedDetectorClassName;
            this.expectedBugPattern = expectedBugPattern;
        }

        @Override
        public void setDetectorFactoryCollection(DetectorFactoryCollection detectorFactoryCollection) {
            super.setDetectorFactoryCollection(detectorFactoryCollection);
            this.detectorFactoryCollection = detectorFactoryCollection;
        }

        @Override
        public void execute() throws IOException, InterruptedException {
            this.executed = true;
            assertNotNull(detectorFactoryCollection);
            assertNotNull(
                    "Configured plugin should be loaded before analysis executes",
                    detectorFactoryCollection.getPluginById(expectedPluginId)
            );
            if (expectedDetectorClassName != null) {
                assertNotNull(
                        "Configured detector should be registered before analysis executes",
                        detectorFactoryCollection.getFactoryByClassName(expectedDetectorClassName)
                );
            }
            if (expectedBugPattern != null) {
                assertNotNull(
                        "Configured bug pattern should be registered before analysis executes",
                        detectorFactoryCollection.lookupBugPattern(expectedBugPattern)
                );
            }
        }

        private boolean wasExecuted() {
            return executed;
        }
    }
}
