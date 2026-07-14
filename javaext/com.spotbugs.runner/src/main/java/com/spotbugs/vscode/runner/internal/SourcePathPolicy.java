package com.spotbugs.vscode.runner.internal;

public final class SourcePathPolicy {

    private SourcePathPolicy() {
    }

    public static String sourceFileName(String value) {
        if (value == null || value.isEmpty() || ".".equals(value) || "..".equals(value)) {
            return null;
        }

        for (int i = 0; i < value.length(); i++) {
            char character = value.charAt(i);
            if (character == '/' || character == '\\' || character == ':' || Character.isISOControl(character)) {
                return null;
            }
        }

        return value;
    }

    public static String relativeSourcePath(String value) {
        if (value == null || value.isEmpty()) {
            return null;
        }

        for (int i = 0; i < value.length(); i++) {
            char character = value.charAt(i);
            if (character == '\\' || character == ':' || Character.isISOControl(character)) {
                return null;
            }
        }

        for (String segment : value.split("/", -1)) {
            if (segment.isEmpty() || ".".equals(segment) || "..".equals(segment)) {
                return null;
            }
        }

        return value;
    }
}
