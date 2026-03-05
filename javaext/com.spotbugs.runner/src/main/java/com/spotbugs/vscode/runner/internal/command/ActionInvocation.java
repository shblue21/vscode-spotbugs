package com.spotbugs.vscode.runner.internal.command;

import org.eclipse.core.runtime.IProgressMonitor;

/**
 * Captures a single command invocation with thread and monitor context.
 */
public final class ActionInvocation {
    private final String commandId;
    private final Object[] args;
    private final IProgressMonitor monitor;
    private final Thread thread;
    private final long startNanos;

    public ActionInvocation(String commandId, Object[] args, IProgressMonitor monitor, Thread thread, long startNanos) {
        this.commandId = commandId;
        this.args = args != null ? args : new Object[0];
        this.monitor = monitor;
        this.thread = thread;
        this.startNanos = startNanos;
    }

    public String getCommandId() {
        return commandId;
    }

    public Object[] getArgs() {
        return args;
    }

    public IProgressMonitor getMonitor() {
        return monitor;
    }

    public Thread getThread() {
        return thread;
    }

    public long getStartNanos() {
        return startNanos;
    }
}
