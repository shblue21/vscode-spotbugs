package com.spotbugs.vscode.runner.internal.command;

/**
 * Represents a single command exposed through the JDT LS delegate handler.
 * Implementations are responsible for processing the raw argument list and returning
 * a JSON string result that the VS Code client can consume.
 */
public interface CommandAction {

    /**
     * @return the fully qualified command identifier (e.g. {@code java.spotbugs.run}).
     */
    String id();

    /**
     * Execute the action for the given arguments.
     *
     * @param args raw arguments supplied by the language server invocation.
     * @return JSON string payload to be forwarded to the VS Code client.
     * @throws Exception if the command processing fails; the caller is expected
     *                   to translate the failure into the standard error envelope.
     */
    String execute(Object... args) throws Exception;
}
