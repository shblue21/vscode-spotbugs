import { OutputChannel, window } from "vscode";

/**
 * A simple logger class that writes to a dedicated VS Code OutputChannel.
 */
export class Logger {
  private static outputChannel: OutputChannel;

  /**
   * Initializes the logger. This should be called once during extension activation.
   */
  public static initialize() {
    if (!this.outputChannel) {
      // Create a new output channel for Spotbugs
      this.outputChannel = window.createOutputChannel("Spotbugs");
    }
  }

  /**
   * Appends a message to the Spotbugs output channel.
   * @param message The message to log.
   */
  public static log(message: string) {
    if (!this.outputChannel) {
      // This is a fallback in case the logger is used before initialization.
      // It should not happen in normal operation.
      console.log(message);
      return;
    }
    this.outputChannel.appendLine(`[Client] ${message}`);
  }

  /**
   * Logs an error message, including the error details.
   * @param message A description of the error.
   * @param error The caught error object (optional).
   */
  public static error(message: string, error?: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.log(`[ERROR] ${message}${error ? `: ${errorMessage}` : ""}`);
  }

  /**
   * Reveals the output channel in the UI.
   */
  public static show() {
    if (this.outputChannel) {
      this.outputChannel.show();
    }
  }
}
