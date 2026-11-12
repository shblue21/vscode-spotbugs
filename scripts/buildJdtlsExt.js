const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const { assertJavaBackendVersions } = require('./validateJavaBackendVersion');

const root = path.resolve(__dirname, '..');
assertJavaBackendVersions(root);
const javaRoot = path.join(root, 'javaext');
cp.execSync(`${process.platform === 'win32' ? 'mvnw.cmd' : './mvnw'} clean package`, {
  cwd: javaRoot,
  stdio: 'inherit',
});

const target = path.join(javaRoot, 'com.spotbugs.runner', 'target');
const server = path.join(root, 'server');
const jar = 'spotbugs-runner-all.jar';
fs.mkdirSync(server, { recursive: true });
fs.copyFileSync(path.join(target, jar), path.join(server, jar));
console.log(`Copied ${jar} -> server/${jar}`);
