const fs = require('fs');
const path = require('path');

function assertJavaBackendVersions(rootDir = process.cwd()) {
  const versions = readJavaBackendVersions(rootDir);
  const errors = validateJavaBackendVersions(versions);

  if (errors.length > 0) {
    throw new Error(`Java backend version validation failed:\n${errors.join('\n')}`);
  }
}

function readJavaBackendVersions(rootDir) {
  const packageJson = JSON.parse(readFile(rootDir, 'package.json'));
  const rootPom = readFile(rootDir, 'javaext/pom.xml');
  const runnerPom = readFile(rootDir, 'javaext/com.spotbugs.runner/pom.xml');
  const targetPom = readFile(rootDir, 'javaext/com.spotbugs.target/pom.xml');
  const manifest = readFile(rootDir, 'javaext/com.spotbugs.runner/META-INF/MANIFEST.MF');

  return {
    packageVersion: packageJson.version,
    rootPomVersion: extractFirstTag(rootPom, 'version', 'javaext/pom.xml'),
    runnerParentVersion: extractParentVersion(
      runnerPom,
      'javaext/com.spotbugs.runner/pom.xml'
    ),
    targetParentVersion: extractParentVersion(
      targetPom,
      'javaext/com.spotbugs.target/pom.xml'
    ),
    bundleVersion: extractBundleVersion(manifest),
  };
}

function validateJavaBackendVersions(versions) {
  const expected = versions.packageVersion;
  const checks = [
    ['javaext/pom.xml version', versions.rootPomVersion],
    ['javaext/com.spotbugs.runner/pom.xml parent version', versions.runnerParentVersion],
    ['javaext/com.spotbugs.target/pom.xml parent version', versions.targetParentVersion],
    ['javaext/com.spotbugs.runner/META-INF/MANIFEST.MF Bundle-Version', versions.bundleVersion],
  ];
  const errors = [];

  if (!/^\d+\.\d+\.\d+$/.test(expected)) {
    errors.push(`package.json version must be X.Y.Z for Java backend metadata but was ${expected}`);
  }

  for (const [label, actual] of checks) {
    if (actual.includes('SNAPSHOT')) {
      errors.push(`${label} must be ${expected} but was ${actual}; SNAPSHOT is not allowed`);
      continue;
    }
    if (actual.includes('qualifier')) {
      errors.push(`${label} must be ${expected} but was ${actual}; qualifier is not allowed`);
      continue;
    }
    if (actual !== expected) {
      errors.push(`${label} must be ${expected} but was ${actual}`);
    }
  }

  return errors;
}

function readFile(rootDir, relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function extractParentVersion(xml, label) {
  const parentMatch = xml.match(/<parent(?:\s[^>]*)?>([\s\S]*?)<\/parent>/);
  if (!parentMatch) {
    throw new Error(`${label} is missing <parent>`);
  }
  return extractFirstTag(parentMatch[1], 'version', `${label} parent`);
}

function extractFirstTag(xml, tagName, label) {
  const tagPattern = new RegExp(`<${tagName}(?:\\s[^>]*)?>([^<]+)</${tagName}>`);
  const match = xml.match(tagPattern);
  if (!match) {
    throw new Error(`${label} is missing <${tagName}>`);
  }
  return match[1].trim();
}

function extractBundleVersion(manifest) {
  const match = manifest.match(/^Bundle-Version:\s*(\S+)\s*$/m);
  if (!match) {
    throw new Error('javaext/com.spotbugs.runner/META-INF/MANIFEST.MF is missing Bundle-Version');
  }
  return match[1].trim();
}

function parseRootArg(argv) {
  const rootIndex = argv.indexOf('--root');
  if (rootIndex === -1) {
    return process.cwd();
  }
  const root = argv[rootIndex + 1];
  if (!root) {
    throw new Error('--root requires a path');
  }
  return root;
}

if (require.main === module) {
  try {
    assertJavaBackendVersions(parseRootArg(process.argv.slice(2)));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  assertJavaBackendVersions,
  readJavaBackendVersions,
  validateJavaBackendVersions,
};
