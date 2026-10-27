package com.spotbugs.vscode.runner.internal;

import static org.junit.Assert.*;
import java.io.File;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import com.spotbugs.vscode.runner.api.PluginInventoryEntry;
import edu.umd.cs.findbugs.Plugin;

public class PluginInventoryServiceTest {
    @Rule public TemporaryFolder temp = new TemporaryFolder();
    private File findSecBugs() throws Exception {
        File jar = new File("target/test-plugins/findsecbugs-plugin-1.11.0.jar").getCanonicalFile();
        assertTrue(jar.isFile());
        return jar;
    }
    @Test public void inventoriesCoreWithoutCustomPlugins() {
        List<PluginInventoryEntry> entries = new PluginInventoryService().inspect(Collections.emptyList());
        assertEquals(1, entries.size());
        assertEquals(-1, entries.get(0).getIndex());
        assertEquals("VALIDATED", entries.get(0).getStatus());
        assertFalse(entries.get(0).getDetectors().isEmpty());
    }
    @Test public void inventoriesRuntimeFactoriesAndCleansUpBeforeNextRequest() throws Exception {
        String path = findSecBugs().getPath();
        for (int iteration = 0; iteration < 2; iteration++) {
            List<PluginInventoryEntry> entries = new PluginInventoryService().inspect(Collections.singletonList(path));
            assertEquals(2, entries.size());
            PluginInventoryEntry entry = entries.get(1);
            assertEquals("VALIDATED", entry.getStatus());
            assertEquals("com.h3xstream.findsecbugs", entry.getPluginId());
            assertTrue(entry.getDetectors().size() > 100);
            assertEquals(entry.getDetectorCount().intValue(), entry.getDetectors().size());
            assertNull(Plugin.getByPluginId(entry.getPluginId()));
        }
    }
    @Test public void missingJarFailsRuntimeInventoryWithoutDescriptorFallback() {
        List<PluginInventoryEntry> entries = new PluginInventoryService().inspect(Collections.singletonList("/missing.jar"));
        assertEquals("VALIDATION_FAILED", entries.get(1).getStatus());
        assertNull(entries.get(1).getDetectors());
    }
    @Test public void retainsCoreAndHealthyDetectorsRegardlessOfFailedRegistrationOrder() throws Exception {
        String healthy = findSecBugs().getPath();
        for (List<String> paths : Arrays.asList(Arrays.asList(healthy, "/missing.jar"), Arrays.asList("/missing.jar", healthy))) {
            List<PluginInventoryEntry> entries = new PluginInventoryService().inspect(paths);
            assertEquals("VALIDATED", entries.get(0).getStatus());
            assertFalse(entries.get(0).getDetectors().isEmpty());
            PluginInventoryEntry good = entries.get(paths.indexOf(healthy) + 1);
            assertEquals("VALIDATED", good.getStatus());
            assertTrue(good.getDetectors().size() > 100);
            assertEquals("VALIDATION_FAILED", entries.get(paths.indexOf("/missing.jar") + 1).getStatus());
            assertNull(Plugin.getByPluginId("com.h3xstream.findsecbugs"));
            try {
                SpotBugsRuntime.LoadedPlugins.load(paths, new edu.umd.cs.findbugs.Project(), PluginLifecycle.DEFAULT);
                fail("Analysis loading must still reject an invalid active registration");
            } catch (java.io.IOException expected) {
                assertTrue(expected.getMessage().contains("/missing.jar"));
            }
            assertNull(Plugin.getByPluginId("com.h3xstream.findsecbugs"));
        }
    }

    @Test public void failedDetectorLoadDoesNotContaminateOtherInventoryEntries() throws Exception {
        File invalid = temp.newFile("invalid-detector.jar");
        String pluginId = "com.spotbugs.test.invalid.detector";
        try (java.util.jar.JarOutputStream jar = new java.util.jar.JarOutputStream(new java.io.FileOutputStream(invalid))) {
            jar.putNextEntry(new java.util.jar.JarEntry("findbugs.xml"));
            jar.write(("<FindbugsPlugin pluginid=\"" + pluginId + "\" provider=\"Test\">"
                    + "<Detector class=\"missing.TestDetector\" reports=\"MISSING_TEST\"/></FindbugsPlugin>")
                    .getBytes(java.nio.charset.StandardCharsets.UTF_8));
            jar.closeEntry();
            jar.putNextEntry(new java.util.jar.JarEntry("messages.xml"));
            jar.write("<MessageCollection><Plugin><ShortDescription>Test</ShortDescription><Details>Test</Details></Plugin></MessageCollection>"
                    .getBytes(java.nio.charset.StandardCharsets.UTF_8));
            jar.closeEntry();
        }
        String healthy = findSecBugs().getPath();
        for (List<String> paths : Arrays.asList(Arrays.asList(healthy, invalid.getPath()), Arrays.asList(invalid.getPath(), healthy))) {
            List<PluginInventoryEntry> entries = new PluginInventoryService().inspect(paths);
            assertEquals("VALIDATED", entries.get(0).getStatus());
            PluginInventoryEntry good = entries.get(paths.indexOf(healthy) + 1);
            assertEquals("VALIDATED", good.getStatus());
            assertFalse(good.getDetectors().isEmpty());
            PluginInventoryEntry failed = entries.get(paths.indexOf(invalid.getPath()) + 1);
            assertEquals("VALIDATION_FAILED", failed.getStatus());
            assertTrue(failed.getErrorMessage().contains("Failed to load SpotBugs plugin"));
            assertNull(Plugin.getByPluginId(pluginId));
            assertNull(Plugin.getByPluginId("com.h3xstream.findsecbugs"));
        }
    }

    @Test public void rejectsRepeatedCanonicalJarsAsValidationFailures() throws Exception {
        File original = findSecBugs();
        File alias = new File(original.getParentFile(), "./" + original.getName());
        for (String second : Arrays.asList(original.getPath(), alias.getPath())) {
            List<PluginInventoryEntry> entries = new PluginInventoryService().inspect(Arrays.asList(original.getPath(), second));
            assertEquals("VALIDATED", entries.get(1).getStatus());
            assertEquals("VALIDATION_FAILED", entries.get(2).getStatus());
            assertTrue(entries.get(2).getErrorMessage().contains("Duplicate plugin JAR registration"));
            assertNull(Plugin.getByPluginId("com.h3xstream.findsecbugs"));
        }
    }

    @Test public void reportsDuplicatePluginIdsAndRejectsAnalysisWithoutLeakingPlugins() throws Exception {
        File original = findSecBugs();
        File copy = new File(temp.getRoot(), "copy.jar");
        Files.copy(original.toPath(), copy.toPath());
        String pluginId = "com.h3xstream.findsecbugs";
        for (List<String> paths : Arrays.asList(
                Arrays.asList(original.getPath(), copy.getPath()),
                Arrays.asList(copy.getPath(), original.getPath()))) {
            List<PluginInventoryEntry> entries = new PluginInventoryService().inspect(paths);
            assertEquals("VALIDATED", entries.get(1).getStatus());
            PluginInventoryEntry duplicate = entries.get(2);
            assertEquals("DUPLICATE_PLUGIN_ID", duplicate.getStatus());
            assertEquals(pluginId, duplicate.getPluginId());
            assertEquals(paths.get(1), duplicate.getPath());
            assertTrue(duplicate.getErrorMessage().contains(pluginId));
            assertNull(Plugin.getByPluginId(pluginId));

            try {
                SpotBugsRuntime.LoadedPlugins.load(paths, new edu.umd.cs.findbugs.Project(), PluginLifecycle.DEFAULT);
                fail("Analysis loading must reject duplicate plugin IDs");
            } catch (SpotBugsRuntime.DuplicatePluginIdException expected) {
                assertEquals(pluginId, expected.getPluginId());
            }
            assertNull(Plugin.getByPluginId(pluginId));
        }
    }
}
