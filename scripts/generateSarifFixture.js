const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const fixtureDir = path.join(repoRoot, 'src', 'test', 'fixtures', 'sarif');
const sampleSource = path.join(fixtureDir, 'SarifFixtureSample.java');
const bugsOutputPath = path.join(fixtureDir, 'bugs.json');
const nativeNormalizedOutputPath = path.join(fixtureDir, 'nativeNormalized.json');
const nativeCliClass = 'com.spotbugs.vscode.runner.internal.dev.NativeSarifFixtureCli';
const runnerJar = path.join(
  repoRoot,
  'javaext',
  'com.spotbugs.runner',
  'target',
  'spotbugs-runner-all.jar'
);
const placeholderWorkspaceRoot = '/__WORKSPACE_ROOT__';

main();

function main() {
  const javaHome = resolveJava17Home();
  runNpmScript('build-server');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spotbugs-sarif-fixture-'));
  const sourceRoot = path.join(tempDir, 'src');
  const classesDir = path.join(tempDir, 'classes');
  const sampleTarget = path.join(sourceRoot, 'fixtures', 'sarif', 'SarifFixtureSample.java');
  fs.mkdirSync(path.dirname(sampleTarget), { recursive: true });
  fs.mkdirSync(classesDir, { recursive: true });
  fs.copyFileSync(sampleSource, sampleTarget);

  const env = {
    ...process.env,
    JAVA_HOME: javaHome,
    PATH: `${path.join(javaHome, 'bin')}${path.delimiter}${process.env.PATH || ''}`,
  };
  execFile(path.join(javaHome, 'bin', 'javac'), [
    '--release',
    '8',
    '-d',
    classesDir,
    sampleTarget,
  ], { env });

  const configJson = JSON.stringify({
    effort: 'max',
    priorityThreshold: 20,
    sourcepaths: [sourceRoot],
  });
  const payloadText = execFile(path.join(javaHome, 'bin', 'java'), [
    '-cp',
    runnerJar,
    nativeCliClass,
    classesDir,
    configJson,
  ], { env });
  const payload = JSON.parse(payloadText);

  const normalizedBugs = normalizeBugs(payload.bugs, sourceRoot);
  const normalizedNative = normalizeSarif(payload.nativeSarif);

  fs.writeFileSync(bugsOutputPath, `${JSON.stringify(normalizedBugs, null, 2)}\n`);
  fs.writeFileSync(
    nativeNormalizedOutputPath,
    `${JSON.stringify(normalizedNative, null, 2)}\n`
  );
}

function resolveJava17Home() {
  if (process.env.JAVA17_HOME) {
    return process.env.JAVA17_HOME;
  }
  if (process.platform === 'darwin') {
    return execFile('/usr/libexec/java_home', ['-v', '17']).trim();
  }
  if (process.env.JAVA_HOME) {
    return process.env.JAVA_HOME;
  }
  throw new Error('Set JAVA17_HOME or JAVA_HOME to a JDK 17 installation.');
}

function runNpmScript(scriptName) {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  execFile(npmCommand, ['run', scriptName], { cwd: repoRoot, stdio: 'inherit' });
}

function execFile(command, args, options = {}) {
  return cp.execFileSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    ...options,
  });
}

function normalizeBugs(bugs, sourceRoot) {
  const sourceRootPath = toPortablePath(sourceRoot);
  return bugs.map((bug) => {
    const normalized = {};
    for (const [key, value] of Object.entries(bug)) {
      if (value === undefined || value === null) {
        continue;
      }
      if (key === 'fullPath' && typeof value === 'string') {
        normalized[key] = normalizeWorkspacePath(value, sourceRootPath);
        continue;
      }
      normalized[key] = value;
    }
    return normalized;
  });
}

function normalizeSarif(log) {
  const run = Array.isArray(log?.runs) && log.runs.length > 0 ? log.runs[0] : {};
  const driver = run?.tool?.driver || {};
  const rules = Array.isArray(driver.rules) ? driver.rules : [];
  const results = Array.isArray(run.results) ? run.results : [];

  return {
    toolDriver: {
      name: driver.name || '',
      version: driver.version || '',
    },
    rules: rules
      .map((rule) => ({
        id: rule.id,
        shortDescription: rule?.shortDescription?.text,
        helpUri: rule.helpUri,
      }))
      .sort(compareById),
    results: results
      .map((result) => ({
        ruleId: result.ruleId,
        level: result.level,
        message: result?.message?.text,
        uri: normalizeUri(result?.locations?.[0]?.physicalLocation?.artifactLocation?.uri),
        startLine: result?.locations?.[0]?.physicalLocation?.region?.startLine,
      }))
      .sort(compareResults),
  };
}

function normalizeUri(uri) {
  if (typeof uri !== 'string' || uri.length === 0) {
    return undefined;
  }
  return uri.replace(/\\/g, '/');
}

function normalizeWorkspacePath(targetPath, sourceRoot) {
  const portablePath = toPortablePath(targetPath);
  if (portablePath.startsWith(`${sourceRoot}/`)) {
    return portablePath.replace(sourceRoot, placeholderWorkspaceRoot);
  }
  return portablePath;
}

function toPortablePath(value) {
  return value.replace(/\\/g, '/');
}

function compareById(left, right) {
  return left.id.localeCompare(right.id);
}

function compareResults(left, right) {
  return (
    left.ruleId.localeCompare(right.ruleId) ||
    (left.uri || '').localeCompare(right.uri || '') ||
    (left.startLine || 0) - (right.startLine || 0) ||
    (left.message || '').localeCompare(right.message || '')
  );
}
