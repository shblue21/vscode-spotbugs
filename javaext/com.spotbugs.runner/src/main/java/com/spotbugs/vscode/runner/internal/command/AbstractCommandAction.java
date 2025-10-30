package com.spotbugs.vscode.runner.internal.command;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

import com.google.gson.Gson;

/**
 * Base implementation for SpotBugs workspace command handlers. Concrete actions only
 * need to focus on their domain logic by implementing {@link #run(ActionContext)} while
 * this class takes care of consistent JSON serialisation and error envelopes.
 */
public abstract class AbstractCommandAction implements CommandAction {

    private static final String DEFAULT_ERROR_CODE = "COMMAND_FAILED";

    private final Gson gson = new Gson();

    @Override
    public final String execute(Object... args) {
        ActionContext context = new ActionContext(args);
        try {
            CommandResult result = run(context);
            if (result == null) {
                return gson.toJson(Collections.emptyMap());
            }
            return result.toJson(gson);
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

    /**
     * Execute the action using the provided context.
     *
     * @param context wrapper that exposes helper accessors for the raw argument array.
     * @return a {@link CommandResult} describing the payload to return to the VS Code client.
     * @throws Exception allows implementations to bubble up domain-specific failures that will be
     *                   transformed into the default error envelope.
     */
    protected abstract CommandResult run(ActionContext context) throws Exception;

    /**
     * Helper for returning a structured payload that will be serialised with Gson.
     */
    protected final CommandResult success(Object payload) {
        return CommandResult.object(payload);
    }

    /**
     * Helper for returning a raw JSON string that should be forwarded as-is.
     */
    protected final CommandResult successRaw(String rawJson) {
        return CommandResult.raw(rawJson);
    }

    /**
     * Helper to surface a validation failure that should flow back as an error envelope.
     */
    protected final CommandActionException invalidArgument(String message) {
        return new CommandActionException("INVALID_ARGUMENT", message);
    }

    /**
     * Builds the standard error envelope understood by the VS Code client.
     */
    protected Map<String, Object> errorEnvelope(String code, String message) {
        Map<String, Object> envelope = new HashMap<>();
        envelope.put("error", message != null ? message : "Command failed");
        if (code != null && !code.isEmpty()) {
            envelope.put("code", code);
        }
        return envelope;
    }

    /**
     * Wrapper around the raw argument array that provides typed accessors.
     */
    protected static final class ActionContext {
        private final Object[] args;

        ActionContext(Object[] args) {
            this.args = args != null ? args : new Object[0];
        }

        public int size() {
            return args.length;
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

        public Object[] raw() {
            return args.clone();
        }
    }

    /**
     * Represents the successful outcome of an action execution.
     */
    protected static final class CommandResult {
        private final boolean rawJson;
        private final Object payload;

        private CommandResult(Object payload, boolean rawJson) {
            this.payload = payload;
            this.rawJson = rawJson;
        }

        static CommandResult object(Object payload) {
            return new CommandResult(payload, false);
        }

        static CommandResult raw(String json) {
            return new CommandResult(json != null ? json : "{}", true);
        }

        String toJson(Gson gson) {
            if (rawJson) {
                return payload != null ? payload.toString() : "{}";
            }
            return gson.toJson(payload);
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
