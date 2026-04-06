import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    const javaExtensionStubPath = path.resolve(
      __dirname,
      '../../src/test/fixtures/redhat.java-stub'
    );
    const extensionTestsPath = path.resolve(__dirname, './index');

    await runTests({
      extensionDevelopmentPath: [extensionDevelopmentPath, javaExtensionStubPath],
      extensionTestsPath,
    });
  } catch (error) {
    console.error('Failed to run VS Code tests');
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(String(error));
    }
    process.exit(1);
  }
}

main();
