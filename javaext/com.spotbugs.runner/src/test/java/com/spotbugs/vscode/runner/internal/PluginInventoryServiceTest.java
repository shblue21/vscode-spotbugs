package com.spotbugs.vscode.runner.internal;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.jar.JarEntry;
import java.util.jar.JarOutputStream;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import com.spotbugs.vscode.runner.api.PluginInventoryEntry;

import edu.umd.cs.findbugs.Plugin;

public class PluginInventoryServiceTest {

    private static final String FINDSECBUGS_PLUGIN_ID = "com.h3xstream.findsecbugs";
    private static final String FINDSECBUGS_FIXTURE_PATH =
            "target/test-plugins/findsecbugs-plugin-1.11.0.jar";

    @Rule
    public TemporaryFolder temp = new TemporaryFolder();

    @Test
    public void inspectReportsValidationFailedForMissingPath() {
        File missing = new File(temp.getRoot(), "missing.jar");

        List<PluginInventoryEntry> entries = new PluginInventoryService()
                .inspect(Collections.singletonList(missing.getAbsolutePath()));

        assertEquals(1, entries.size());
        assertEquals("VALIDATION_FAILED", entries.get(0).getStatus());
        assertEquals(missing.getAbsolutePath(), entries.get(0).getPath());
        assertTrue(entries.get(0).getErrorMessage().contains("not found"));
    }

    @Test
    public void inspectReportsDuplicatePluginIdWithinConfiguredPaths() throws Exception {
        File first = createPluginJar("com.example.duplicate", "first.jar");
        File second = createPluginJar("com.example.duplicate", "second.jar");

        List<PluginInventoryEntry> entries = new PluginInventoryService()
                .inspect(Arrays.asList(first.getAbsolutePath(), second.getAbsolutePath()));

        assertEquals(2, entries.size());
        assertEquals("VALIDATED", entries.get(0).getStatus());
        assertEquals("com.example.duplicate", entries.get(0).getPluginId());
        assertEquals("1.2.3", entries.get(0).getVersion());
        assertEquals("DUPLICATE_PLUGIN_ID", entries.get(1).getStatus());
        assertEquals(Integer.valueOf(2), entries.get(1).getDetectorCount());
        assertEquals(Integer.valueOf(3), entries.get(1).getBugPatternCount());
    }

    @Test
    public void inspectDoesNotReportSameCanonicalJarAsDuplicatePluginId() throws Exception {
        File plugin = createPluginJar("com.example.alias", "alias.jar");
        File alias = new File(temp.newFolder("sub"), "../alias.jar");

        List<PluginInventoryEntry> entries = new PluginInventoryService()
                .inspect(Arrays.asList(plugin.getAbsolutePath(), alias.getPath()));

        assertEquals("VALIDATED", entries.get(0).getStatus());
        assertEquals("VALIDATED", entries.get(1).getStatus());
        assertEquals(entries.get(0).getCanonicalPath(), entries.get(1).getCanonicalPath());
    }

    @Test
    public void inspectTreatsPluginsWithoutPluginIdAsValidated() throws Exception {
        File first = createPluginJar(null, "anonymous-first.jar");
        File second = createPluginJar(null, "anonymous-second.jar");

        List<PluginInventoryEntry> entries = new PluginInventoryService()
                .inspect(Arrays.asList(first.getAbsolutePath(), second.getAbsolutePath()));

        assertEquals(2, entries.size());
        assertEquals("VALIDATED", entries.get(0).getStatus());
        assertNull(entries.get(0).getPluginId());
        assertEquals("VALIDATED", entries.get(1).getStatus());
        assertNull(entries.get(1).getPluginId());
    }

    @Test
    public void inspectRejectsUppercaseJarExtensionBeforeValidation() throws Exception {
        File plugin = createPluginJar("com.example.uppercase", "uppercase.JAR");

        List<PluginInventoryEntry> entries = new PluginInventoryService()
                .inspect(Collections.singletonList(plugin.getAbsolutePath()));

        assertEquals(1, entries.size());
        assertEquals("VALIDATION_FAILED", entries.get(0).getStatus());
        assertTrue(entries.get(0).getErrorMessage().contains("Plugin path is not a jar file"));
    }

    @Test
    public void inspectKeepsFindSecBugsVisibleAfterMissingPathWithoutRegisteringIt() throws Exception {
        File missing = new File(temp.getRoot(), "missing.jar");
        File findSecBugs = new File(FINDSECBUGS_FIXTURE_PATH).getCanonicalFile();
        assertTrue("FindSecBugs test fixture is missing", findSecBugs.isFile());
        Plugin registeredBefore = Plugin.getByPluginId(FINDSECBUGS_PLUGIN_ID);

        List<PluginInventoryEntry> entries = new PluginInventoryService()
                .inspect(Arrays.asList(missing.getAbsolutePath(), findSecBugs.getAbsolutePath()));

        assertEquals(2, entries.size());
        assertEquals("VALIDATION_FAILED", entries.get(0).getStatus());
        assertEquals("VALIDATED", entries.get(1).getStatus());
        assertEquals(FINDSECBUGS_PLUGIN_ID, entries.get(1).getPluginId());
        assertEquals("Find Security Bugs", entries.get(1).getShortDescription());
        assertEquals("Find Security Bugs", entries.get(1).getProvider());
        assertEquals("https://find-sec-bugs.github.io", entries.get(1).getWebsite());
        assertNull(entries.get(1).getVersion());
        assertEquals(Integer.valueOf(114), entries.get(1).getDetectorCount());
        assertEquals(Integer.valueOf(138), entries.get(1).getBugPatternCount());
        assertSame(registeredBefore, Plugin.getByPluginId(FINDSECBUGS_PLUGIN_ID));
    }

    @Test
    public void inspectKeepsSpotBugsValidationWhenOptionalDescriptorMetadataFails() throws Exception {
        File plugin = createPluginJarWithDescriptor("invalid-root.jar", "<NotAFindbugsPlugin/>");

        PluginInventoryEntry entry = new PluginInventoryService()
                .inspect(Collections.singletonList(plugin.getAbsolutePath())).get(0);

        assertEquals("VALIDATED", entry.getStatus());
        assertEquals("SpotBugs runner test plugin", entry.getShortDescription());
        assertNull(entry.getVersion());
        assertNull(entry.getDetectorCount());
        assertNull(entry.getBugPatternCount());
    }

    private File createPluginJar(String pluginId, String fileName) throws Exception {
        return createPluginJarWithDescriptor(fileName, findbugsXml(pluginId));
    }

    private File createPluginJarWithDescriptor(String fileName, String descriptor) throws Exception {
        File jar = temp.newFile(fileName);
        try (JarOutputStream out = new JarOutputStream(new FileOutputStream(jar))) {
            writeJarEntry(out, "findbugs.xml", descriptor);
            writeJarEntry(out, "messages.xml", messagesXml());
        }
        return jar;
    }

    private static void writeJarEntry(JarOutputStream out, String name, String content) throws Exception {
        out.putNextEntry(new JarEntry(name));
        out.write(content.getBytes(StandardCharsets.UTF_8));
        out.closeEntry();
    }

    private static String findbugsXml(String pluginId) {
        String pluginIdAttribute = pluginId != null ? " pluginid=\"" + pluginId + "\"" : "";
        return "<FindbugsPlugin" + pluginIdAttribute
                + " provider=\"SpotBugs Runner Test\""
                + " website=\"https://example.com/spotbugs-runner-test\""
                + " version=\"1.2.3\" defaultenabled=\"true\">"
                + "<Detector class=\"com.example.FirstDetector\"/>"
                + "<Detector class=\"com.example.SecondDetector\"/>"
                + "<BugPattern type=\"EXAMPLE_ONE\"/>"
                + "<BugPattern type=\"EXAMPLE_TWO\"/>"
                + "<BugPattern type=\"EXAMPLE_THREE\"/>"
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
}
