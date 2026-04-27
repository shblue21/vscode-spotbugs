import * as assert from 'assert';
import * as vscode from 'vscode';
import { SpotBugsCommands } from '../constants/commands';

describe('Extension activation', () => {
  it('registers SpotBugs commands', async () => {
    const extensionId = 'shblue21.vscode-spotbugs';
    const extension = vscode.extensions.getExtension(extensionId);
    assert.ok(extension, `Extension ${extensionId} not found`);

    await extension!.activate();
    const registered = await vscode.commands.getCommands(true);

    const expected = [
      SpotBugsCommands.RUN_ANALYSIS,
      SpotBugsCommands.RUN_WORKSPACE,
      SpotBugsCommands.REVEAL_FINDING_SOURCE,
      SpotBugsCommands.OPEN_FINDING_DETAILS,
      SpotBugsCommands.FILTER_RESULTS,
      SpotBugsCommands.EXPORT_SARIF,
      SpotBugsCommands.RESET_RESULTS,
    ];

    for (const cmd of expected) {
      assert.ok(registered.includes(cmd), `Missing command: ${cmd}`);
    }

    assert.ok(
      !registered.includes('spotbugs.openBugLocation'),
      'Legacy command should not be registered: spotbugs.openBugLocation'
    );
  });
});
