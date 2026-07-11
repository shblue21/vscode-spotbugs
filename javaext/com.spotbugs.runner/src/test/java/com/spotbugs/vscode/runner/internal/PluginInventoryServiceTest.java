package com.spotbugs.vscode.runner.internal;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
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

public class PluginInventoryServiceTest {

    @Rule
    public TemporaryFolder temp = new TemporaryFolder();

    @Test
    public void inspectReportsLoadFailedForMissingPath() {
        File missing = new File(temp.getRoot(), "missing.jar");

        List<PluginInventoryEntry> entries = new PluginInventoryService()
                .inspect(Collections.singletonList(missing.getAbsolutePath()));

        assertEquals(1, entries.size());
        assertEquals("LOAD_FAILED", entries.get(0).getStatus());
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
        assertEquals("LOADABLE", entries.get(0).getStatus());
        assertEquals("com.example.duplicate", entries.get(0).getPluginId());
        assertEquals("DUPLICATE_PLUGIN_ID", entries.get(1).getStatus());
    }

    @Test
    public void inspectTreatsPluginsWithoutPluginIdAsLoadable() throws Exception {
        File first = createPluginJar(null, "anonymous-first.jar");
        File second = createPluginJar(null, "anonymous-second.jar");

        List<PluginInventoryEntry> entries = new PluginInventoryService()
                .inspect(Arrays.asList(first.getAbsolutePath(), second.getAbsolutePath()));

        assertEquals(2, entries.size());
        assertEquals("LOADABLE", entries.get(0).getStatus());
        assertNull(entries.get(0).getPluginId());
        assertEquals("LOADABLE", entries.get(1).getStatus());
        assertNull(entries.get(1).getPluginId());
    }

    @Test
    public void inspectRejectsUppercaseJarExtensionBeforeValidation() throws Exception {
        File plugin = createPluginJar("com.example.uppercase", "uppercase.JAR");

        List<PluginInventoryEntry> entries = new PluginInventoryService()
                .inspect(Collections.singletonList(plugin.getAbsolutePath()));

        assertEquals(1, entries.size());
        assertEquals("LOAD_FAILED", entries.get(0).getStatus());
        assertTrue(entries.get(0).getErrorMessage().contains("Plugin path is not a jar file"));
    }

    private File createPluginJar(String pluginId, String fileName) throws Exception {
        File jar = temp.newFile(fileName);
        try (JarOutputStream out = new JarOutputStream(new FileOutputStream(jar))) {
            writeJarEntry(out, "findbugs.xml", findbugsXml(pluginId));
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
        return "<FindbugsPlugin" + pluginIdAttribute + " provider=\"SpotBugs Runner Test\" defaultenabled=\"true\">"
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
