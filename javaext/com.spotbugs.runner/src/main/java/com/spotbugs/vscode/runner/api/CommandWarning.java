package com.spotbugs.vscode.runner.api;

public class CommandWarning {
    private final String code;
    private final String message;

    public CommandWarning(String code, String message) {
        this.code = code;
        this.message = message;
    }

    public String getCode() {
        return code;
    }

    public String getMessage() {
        return message;
    }
}
