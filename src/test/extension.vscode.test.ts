import * as assert from 'assert';
import * as vscode from 'vscode';
import { SpotBugsCommands } from '../constants/commands';

suite('Extension activation', () => {
  test('registers SpotBugs commands', async () => {
    const extensionId = 'shblue21.vscode-spotbugs';
    const extension = vscode.extensions.getExtension(extensionId);
    assert.ok(extension, `Extension ${extensionId} not found`);

    await extension!.activate();
    const registered = await vscode.commands.getCommands(true);

    const expected = [
      SpotBugsCommands.RUN_ANALYSIS,
      SpotBugsCommands.RUN_WORKSPACE,
      SpotBugsCommands.OPEN_BUG_LOCATION,
      SpotBugsCommands.FILTER_RESULTS,
      SpotBugsCommands.EXPORT_SARIF,
      SpotBugsCommands.RESET_RESULTS,
    ];

    for (const cmd of expected) {
      assert.ok(registered.includes(cmd), `Missing command: ${cmd}`);
    }
  });
});
