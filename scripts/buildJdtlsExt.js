const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const { assertJavaBackendVersions } = require('./validateJavaBackendVersion');

const root = path.resolve(__dirname, '..');
assertJavaBackendVersions(root);
const { version } = require(path.join(root, 'package.json'));
const javaRoot = path.join(root, 'javaext');
cp.execSync(`${process.platform === 'win32' ? 'mvnw.cmd' : './mvnw'} clean package`, {
  cwd: javaRoot,
  stdio: 'inherit',
});

const target = path.join(javaRoot, 'com.spotbugs.runner', 'target');
const server = path.join(root, 'server');
fs.mkdirSync(server, { recursive: true });
for (const [source, destination] of [
  [`com.spotbugs.runner-${version}.jar`, 'com.spotbugs.runner.jar'],
  ['spotbugs-runner-all.jar', 'spotbugs-runner-all.jar'],
]) {
  fs.copyFileSync(path.join(target, source), path.join(server, destination));
  console.log(`Copied ${source} -> server/${destination}`);
}
