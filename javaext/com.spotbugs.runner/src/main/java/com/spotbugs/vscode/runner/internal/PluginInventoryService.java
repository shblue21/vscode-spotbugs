package com.spotbugs.vscode.runner.internal;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;

import com.spotbugs.vscode.runner.api.PluginInventoryEntry;

import edu.umd.cs.findbugs.PluginLoader;

public class PluginInventoryService {

    private static final String STATUS_VALIDATED = "VALIDATED";
    private static final String STATUS_DUPLICATE_PLUGIN_ID = "DUPLICATE_PLUGIN_ID";
    private static final String STATUS_VALIDATION_FAILED = "VALIDATION_FAILED";

    public List<PluginInventoryEntry> inspect(List<String> pluginPaths) {
        List<String> paths = pluginPaths != null ? pluginPaths : java.util.Collections.emptyList();
        Map<String, Integer> firstIndexByPluginId = new HashMap<>();
        Set<String> canonicalPaths = new HashSet<>();
        List<PluginInventoryEntry> entries = new ArrayList<>();

        for (int index = 0; index < paths.size(); index++) {
            entries.add(inspectOne(index, paths.get(index), firstIndexByPluginId, canonicalPaths));
        }
        return entries;
    }

    private PluginInventoryEntry inspectOne(
            int index,
            String configuredPath,
            Map<String, Integer> firstIndexByPluginId,
            Set<String> canonicalPaths
    ) {
        String path = configuredPath != null ? configuredPath : "";
        if (path.trim().isEmpty()) {
            return failed(index, path, null, "Plugin path is empty.");
        }

        File canonicalFile;
        try {
            canonicalFile = new File(path).getCanonicalFile();
        } catch (IOException e) {
            return failed(index, path, null, message("Could not resolve plugin path", e));
        }

        String canonicalPath = canonicalFile.getAbsolutePath();
        boolean firstCanonicalPath = canonicalPaths.add(canonicalPath);
        if (!canonicalFile.exists()) {
            return failed(index, path, canonicalPath, "Plugin jar not found: " + canonicalPath);
        }
        if (!canonicalFile.isFile()) {
            return failed(index, path, canonicalPath, "Plugin path is not a file: " + canonicalPath);
        }
        if (!canonicalFile.getName().endsWith(".jar")) {
            return failed(index, path, canonicalPath, "Plugin path is not a jar file: " + canonicalPath);
        }

        PluginLoader.Summary summary;
        try {
            synchronized (PluginLoader.class) {
                summary = PluginLoader.validate(canonicalFile);
            }
        } catch (Exception e) {
            return failed(index, path, canonicalPath, message("Plugin jar failed validation", e));
        }

        DescriptorInfo descriptor = DescriptorInfo.EMPTY;
        try {
            descriptor = inspectDescriptor(canonicalFile);
        } catch (Exception ignored) {
            // Descriptor metadata is optional and must not override SpotBugs validation.
        }

        String pluginId = trimToNull(summary != null ? summary.id : null);
        String shortDescription = trimToNull(summary != null ? summary.description : null);
        String provider = trimToNull(summary != null ? summary.provider : null);
        String website = trimToNull(summary != null ? summary.webbsite : null);
        if (pluginId != null && firstCanonicalPath) {
            Integer duplicateIndex = firstIndexByPluginId.get(pluginId);
            if (duplicateIndex != null) {
                return new PluginInventoryEntry(
                        index,
                        path,
                        canonicalPath,
                        STATUS_DUPLICATE_PLUGIN_ID,
                        pluginId,
                        shortDescription,
                        provider,
                        website,
                        descriptor.version,
                        descriptor.detectorCount,
                        descriptor.bugPatternCount,
                        "Duplicate plugin id: " + pluginId
                );
            }
            firstIndexByPluginId.put(pluginId, index);
        }

        return new PluginInventoryEntry(
                index,
                path,
                canonicalPath,
                STATUS_VALIDATED,
                pluginId,
                shortDescription,
                provider,
                website,
                descriptor.version,
                descriptor.detectorCount,
                descriptor.bugPatternCount,
                null
        );
    }

    private static PluginInventoryEntry failed(
            int index,
            String path,
            String canonicalPath,
            String message
    ) {
        return new PluginInventoryEntry(
                index,
                path,
                canonicalPath,
                STATUS_VALIDATION_FAILED,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                message
        );
    }

    private static DescriptorInfo inspectDescriptor(File pluginJar) throws Exception {
        try (ZipFile zipFile = new ZipFile(pluginJar)) {
            ZipEntry descriptorEntry = zipFile.getEntry("findbugs.xml");
            if (descriptorEntry == null) {
                throw new IllegalArgumentException("Plugin descriptor findbugs.xml was not found.");
            }

            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
            factory.setXIncludeAware(false);
            factory.setExpandEntityReferences(false);
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");

            try (InputStream input = zipFile.getInputStream(descriptorEntry)) {
                Document document = factory.newDocumentBuilder().parse(input);
                Element root = document.getDocumentElement();
                if (root == null || !"FindbugsPlugin".equals(root.getTagName())) {
                    throw new IllegalArgumentException("Plugin descriptor root must be FindbugsPlugin.");
                }

                int detectorCount = 0;
                int bugPatternCount = 0;
                for (Node child = root.getFirstChild(); child != null; child = child.getNextSibling()) {
                    if (child.getNodeType() != Node.ELEMENT_NODE) {
                        continue;
                    }
                    if ("Detector".equals(child.getNodeName())) {
                        detectorCount++;
                    } else if ("BugPattern".equals(child.getNodeName())) {
                        bugPatternCount++;
                    }
                }
                return new DescriptorInfo(trimToNull(root.getAttribute("version")), detectorCount, bugPatternCount);
            }
        }
    }

    private static String message(String prefix, Exception exception) {
        String detail = exception != null ? exception.getMessage() : null;
        if (detail == null || detail.trim().isEmpty()) {
            detail = exception != null ? exception.getClass().getSimpleName() : "Unknown error";
        }
        return prefix + ": " + detail;
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static final class DescriptorInfo {
        private static final DescriptorInfo EMPTY = new DescriptorInfo(null, null, null);

        private final String version;
        private final Integer detectorCount;
        private final Integer bugPatternCount;

        private DescriptorInfo(String version, Integer detectorCount, Integer bugPatternCount) {
            this.version = version;
            this.detectorCount = detectorCount;
            this.bugPatternCount = bugPatternCount;
        }
    }
}
