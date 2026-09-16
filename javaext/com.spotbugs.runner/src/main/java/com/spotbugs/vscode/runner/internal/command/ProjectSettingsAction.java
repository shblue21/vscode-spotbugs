package com.spotbugs.vscode.runner.internal.command;

import java.util.List;
import java.util.concurrent.CancellationException;

import org.eclipse.jdt.ls.core.internal.commands.ProjectCommand;

import com.spotbugs.vscode.runner.api.CommandResponse;
import com.spotbugs.vscode.runner.internal.projectmodel.ProjectSettingsSnapshot;

/** Replaces the settings lookup; never performs a second binding or Gradle model lookup. */
public final class ProjectSettingsAction extends AbstractCommandAction {
    @FunctionalInterface
    interface SettingsReader {
        Object read(String uri) throws Exception;
    }

    private final SettingsReader reader;

    public ProjectSettingsAction() {
        this(uri -> ProjectCommand.getProjectSettings(uri, List.of(
                ProjectCommand.SOURCE_PATHS, ProjectCommand.OUTPUT_PATH,
                "org.eclipse.jdt.ls.core.classpathEntries")));
    }

    ProjectSettingsAction(SettingsReader reader) {
        this.reader = reader;
    }

    @Override
    public String id() {
        return "java.spotbugs.project.settings";
    }

    @Override
    protected String cancellationErrorCode() {
        return "ANALYSIS_CANCELLED";
    }

    @Override
    protected CommandResponse run(ActionContext context) throws Exception {
        String uri = context.requireStringArg(0, "projectUri");
        try {
            ProjectSettingsSnapshot snapshot = ProjectSettingsSnapshot.fromSettings(reader.read(uri));
            context.checkCanceled(cancellationErrorCode());
            return snapshot == null
                    ? CommandResponse.error("JAVA_LS_PROJECT_SETTINGS_FAILED", "Java project settings returned no usable result.")
                    : CommandResponse.success(List.of(snapshot), null);
        } catch (CancellationException cancelled) {
            throw new CommandActionException(cancellationErrorCode(), "Command cancelled");
        }
    }
}
