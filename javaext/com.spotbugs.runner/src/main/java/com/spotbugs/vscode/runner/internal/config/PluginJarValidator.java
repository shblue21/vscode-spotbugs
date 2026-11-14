package com.spotbugs.vscode.runner.internal.config;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;

import com.spotbugs.vscode.runner.api.ConfigError;

/**
 * Validates SpotBugs plugin jar paths before analysis starts.
 */
final class PluginJarValidator {

    private static final String CODE_PLUGIN_NOT_FOUND = "CFG_PLUGIN_NOT_FOUND";
    private static final String CODE_PLUGIN_NOT_FILE = "CFG_PLUGIN_NOT_FILE";
    private static final String CODE_PLUGIN_NOT_JAR = "CFG_PLUGIN_NOT_JAR";
    private static final String CODE_PLUGIN_UNREADABLE = "CFG_PLUGIN_UNREADABLE";

    private PluginJarValidator() {
    }

    static ConfigError validatePluginJars(List<String> pluginPaths) {
        if (pluginPaths == null || pluginPaths.isEmpty()) {
            return null;
        }
        for (String pluginPath : pluginPaths) {
            ConfigError error = validateSinglePluginJar(pluginPath);
            if (error != null) {
                return error;
            }
        }
        return null;
    }

    private static ConfigError validateSinglePluginJar(String pluginPath) {
        String absolutePath = new File(pluginPath).getAbsolutePath();
        File pluginJar = new File(absolutePath);
        if (!pluginJar.exists()) {
            return error(CODE_PLUGIN_NOT_FOUND, "SpotBugs plugin jar not found: " + absolutePath);
        }
        if (!pluginJar.isFile()) {
            return error(CODE_PLUGIN_NOT_FILE, "SpotBugs plugin path is not a regular file: " + absolutePath);
        }
        if (!isJarPath(pluginJar.getName())) {
            return error(CODE_PLUGIN_NOT_JAR, "SpotBugs plugin path must be a .jar file: " + absolutePath);
        }
        try (InputStream input = new FileInputStream(pluginJar)) {
            // Match the picker check: opening the file is enough; content is validated at load time.
        } catch (IOException e) {
            return error(CODE_PLUGIN_UNREADABLE,
                    "SpotBugs plugin jar is not readable: " + absolutePath + " (" + rootCauseMessage(e) + ")");
        }
        return null;
    }

    private static boolean isJarPath(String fileName) {
        int lastDot = fileName.lastIndexOf('.');
        return lastDot > 0 && ".jar".equals(fileName.substring(lastDot));
    }

    private static ConfigError error(String code, String message) {
        return new ConfigError(code, message);
    }

    private static String rootCauseMessage(Throwable throwable) {
        if (throwable == null) {
            return "Unknown error";
        }
        Throwable root = throwable;
        while (root.getCause() != null && root.getCause() != root) {
            root = root.getCause();
        }
        String message = root.getMessage();
        if (message == null || message.trim().isEmpty()) {
            return root.getClass().getSimpleName();
        }
        return message.trim();
    }
}
