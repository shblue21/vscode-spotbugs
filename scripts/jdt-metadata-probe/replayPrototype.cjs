// Replay real captured Java LS responses through the current TypeScript resolver.
// Compile the repository first. This is not a replacement for live JDT testing.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function main() {
  if (!process.argv[2] || !process.argv[3]) {
    throw new Error('Usage: node replayPrototype.cjs metadata.json replay-output.json');
  }
  const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const root = path.resolve(__dirname, '../..');
  const { installVscodeMock } = require(path.join(root, 'out/test/helpers/mockVscode'));
  installVscodeMock();
  const gateway = require(path.join(root, 'out/lsp/javaLsGateway'));
  const service = require(path.join(root, 'out/workspace/classpathService'));
  const rows = [];
  for (const suffix of ['/eclipse-app', '/maven-parent/app', '/gradle-parent/app']) {
    const project = data.projects.find((p) => p.uri.endsWith(suffix));
    const entry = project.rawEntries.find((e) => e.kind === data.constants.sourceEntryKind && e.path.endsWith('/src/test/java'));
    gateway.requestJavaIsTestFile = async () => entry.isTest;
    gateway.requestJavaClasspaths = async () => project.environments.test;
    if (!project.settingsSnapshot?.results?.[0]) throw new Error('Rerun the current packaged JDT probe with --bundle');
    gateway.requestJavaProjectSettings = async () => project.settingsSnapshot.results[0];
    const result = await service.getClasspathsOutcome(pathToFileURL(path.join(entry.path, 'demo/Test.java')).toString());
    const actual = result.classpath?.sourceOutputs?.[entry.path] ?? null;
    rows.push({ project: suffix, expected: entry.effectiveOutput, actual, outputMappingCorrect: actual === entry.effectiveOutput });
  }
  fs.writeFileSync(process.argv[3], JSON.stringify(rows, null, 2) + '\n');
  assert(rows.every((row) => row.outputMappingCorrect), 'Captured JDT source output was not preserved; inspect replay output');
  console.log('SOURCE_OUTPUT_MAPPING_VERIFIED: 3/3 captured test outputs preserved');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
