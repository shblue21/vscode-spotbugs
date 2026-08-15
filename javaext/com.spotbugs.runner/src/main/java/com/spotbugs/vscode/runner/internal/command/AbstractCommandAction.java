package com.spotbugs.vscode.runner.internal.command;

import java.util.Collections;

import org.eclipse.core.runtime.IProgressMonitor;

import com.google.gson.Gson;
import com.spotbugs.vscode.runner.api.CommandResponse;

/**
 * Base implementation for SpotBugs workspace command handlers. Concrete actions only
 * need to focus on their domain logic by implementing {@link #run(ActionContext)} while
 * this class takes care of consistent JSON serialisation and error envelopes.
 */
public abstract class AbstractCommandAction {

    private static final String DEFAULT_ERROR_CODE = "COMMAND_FAILED";

    private final Gson gson = new Gson();

    public final String execute(Object[] args, IProgressMonitor monitor) {
        ActionContext context = new ActionContext(args, monitor);
        try {
            context.checkCanceled(cancellationErrorCode());
            CommandResponse response = run(context);
            if (shouldCheckCanceledAfterRun()) {
                context.checkCanceled(cancellationErrorCode());
            }
            if (response == null) {
                return gson.toJson(Collections.emptyMap());
            }
            return gson.toJson(response);
        } catch (CommandActionException cae) {
            return gson.toJson(errorEnvelope(cae.getCode(), cae.getMessage()));
        } catch (Exception exception) {
            String message = exception.getMessage();
            if (message == null || message.trim().isEmpty()) {
                message = exception.getClass().getSimpleName();
            }
            return gson.toJson(errorEnvelope(DEFAULT_ERROR_CODE, message));
        }
    }

    public abstract String id();

    /**
     * Execute the action using the provided context.
     *
     * @param context wrapper that exposes helper accessors for the raw argument array.
     * @return response payload to return to the VS Code client.
     * @throws Exception allows implementations to bubble up domain-specific failures that will be
     *                   transformed into the default error envelope.
     */
    protected abstract CommandResponse run(ActionContext context) throws Exception;

    /**
     * Error code to use when wrapper-level cancellation is detected.
     */
    protected String cancellationErrorCode() {
        return DEFAULT_ERROR_CODE;
    }

    /**
     * Whether the wrapper should check cancellation again after run(...).
     * Actions that return their own cancellation envelope with stats can override this.
     */
    protected boolean shouldCheckCanceledAfterRun() {
        return true;
    }

    /**
     * Builds the standard error envelope understood by the VS Code client.
     */
    protected CommandResponse errorEnvelope(String code, String message) {
        String safeCode = (code != null && !code.isEmpty()) ? code : DEFAULT_ERROR_CODE;
        String safeMessage = message != null ? message : "Command failed";
        return CommandResponse.error(safeCode, safeMessage);
    }

    /**
     * Wrapper around the raw argument array that provides typed accessors.
     */
    protected static final class ActionContext {
        private final Object[] args;
        private final IProgressMonitor monitor;

        ActionContext(Object[] args, IProgressMonitor monitor) {
            this.args = args != null ? args : new Object[0];
            this.monitor = monitor;
        }

        public Object get(int index) throws CommandActionException {
            if (index < 0 || index >= args.length) {
                throw new CommandActionException("INVALID_ARGUMENT", "Missing argument at index " + index);
            }
            return args[index];
        }

        public String requireStringArg(int index, String name) throws CommandActionException {
            Object value = get(index);
            if (!(value instanceof String)) {
                throw new CommandActionException("INVALID_ARGUMENT",
                        String.format("Argument '%s' must be a string", name != null ? name : String.valueOf(index)));
            }
            String str = (String) value;
            if (str.trim().isEmpty()) {
                throw new CommandActionException("INVALID_ARGUMENT",
                        String.format("Argument '%s' must not be empty", name != null ? name : String.valueOf(index)));
            }
            return str;
        }

        public String optionalStringArg(int index) {
            if (index < 0 || index >= args.length) {
                return null;
            }
            Object value = args[index];
            return value instanceof String ? (String) value : null;
        }

        public void checkCanceled(String code) throws CommandActionException {
            if (monitor != null && monitor.isCanceled()) {
                throw new CommandActionException(code, "Command cancelled");
            }
        }

        public IProgressMonitor monitor() {
            return monitor;
        }
    }

    /**
     * Exception used to signal expected command failures such as invalid arguments.
     */
    protected static class CommandActionException extends Exception {
        private final String code;

        CommandActionException(String code, String message) {
            super(message);
            this.code = code != null ? code : DEFAULT_ERROR_CODE;
        }

        public String getCode() {
            return code;
        }
    }
}
