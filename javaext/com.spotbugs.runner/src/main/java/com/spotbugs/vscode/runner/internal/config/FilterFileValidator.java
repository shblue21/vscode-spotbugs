package com.spotbugs.vscode.runner.internal.config;

import java.io.File;
import java.util.HashSet;
import java.util.List;

import com.spotbugs.vscode.runner.api.ConfigError;

import edu.umd.cs.findbugs.ExcludingHashesBugReporter;
import edu.umd.cs.findbugs.filter.Filter;

/**
 * Validates SpotBugs filter files before analysis starts.
 */
final class FilterFileValidator {

    private static final String CODE_FILTER_NOT_FOUND = "CFG_FILTER_NOT_FOUND";
    private static final String CODE_FILTER_NOT_FILE = "CFG_FILTER_NOT_FILE";
    private static final String CODE_FILTER_UNREADABLE = "CFG_FILTER_UNREADABLE";
    private static final String CODE_FILTER_XML_INVALID = "CFG_FILTER_XML_INVALID";
    private static final String CODE_BASELINE_XML_INVALID = "CFG_BASELINE_XML_INVALID";

    private FilterFileValidator() {
    }

    static ConfigError validateIncludeFilters(List<String> includeFilterPaths) {
        return validateFilterList(includeFilterPaths, "include", false);
    }

    static ConfigError validateExcludeFilters(List<String> excludeFilterPaths) {
        return validateFilterList(excludeFilterPaths, "exclude", false);
    }

    static ConfigError validateBaselineFilters(List<String> baselineFilterPaths) {
        return validateFilterList(baselineFilterPaths, "baseline", true);
    }

    private static ConfigError validateFilterList(List<String> paths, String kind, boolean baseline) {
        if (paths == null || paths.isEmpty()) {
            return null;
        }
        for (String rawPath : paths) {
            ConfigError error = validateSinglePath(rawPath, kind, baseline);
            if (error != null) {
                return error;
            }
        }
        return null;
    }

    private static ConfigError validateSinglePath(String rawPath, String kind, boolean baseline) {
        String absolutePath = new File(rawPath).getAbsolutePath();
        File filterFile = new File(absolutePath);
        if (!filterFile.exists()) {
            return error(CODE_FILTER_NOT_FOUND, kind + " filter file not found: " + absolutePath);
        }
        if (!filterFile.isFile()) {
            return error(CODE_FILTER_NOT_FILE, kind + " filter file is not a regular file: " + absolutePath);
        }
        if (!filterFile.canRead()) {
            return error(CODE_FILTER_UNREADABLE, kind + " filter file is not readable: " + absolutePath);
        }
        try {
            if (baseline) {
                ExcludingHashesBugReporter.addToExcludedInstanceHashes(new HashSet<String>(), absolutePath);
            } else {
                Filter.parseFilter(absolutePath);
            }
        } catch (Exception e) {
            String code = baseline ? CODE_BASELINE_XML_INVALID : CODE_FILTER_XML_INVALID;
            return error(code, kind + " filter file is invalid: " + absolutePath + " (" + rootCauseMessage(e) + ")");
        }
        return null;
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
