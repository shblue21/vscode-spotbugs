package com.spotbugs.vscode.runner.api;

/** Structured configuration error for future wire use. */
public class ConfigError {
    private final String code;
    private final String message;

    public ConfigError(String code, String message) {
        this.code = code;
        this.message = message;
    }

    public String getCode() { return code; }
    public String getMessage() { return message; }
}

