const cp = require('child_process');
const path = require('path');
const fse = require('fs-extra');

const server_dir = path.resolve('./javaext');

// Run Maven build
cp.execSync(mvnw() + ' clean package', { cwd: server_dir, stdio: 'inherit' });

// Copy all generated jars from the runner to the server directory
const runnerJarFolder = path.join(server_dir, 'com.spotbugs.runner/target');
const targetFolder = path.resolve('./server');

if (fse.existsSync(runnerJarFolder)) {
  const jars = fse
    .readdirSync(runnerJarFolder)
    .filter((file) => path.extname(file) === '.jar');
  fse.ensureDirSync(targetFolder);

  for (const jar of jars) {
    fse.copySync(path.join(runnerJarFolder, jar), path.join(targetFolder, jar));
    console.log(`Copied ${jar} to server/`);
  }

  // Create a stable, versionless alias for the OSGi plugin JAR
  // so package.json can reference a constant path.
  const pluginJar = jars.find((j) => j.startsWith('com.spotbugs.runner-') && j.endsWith('.jar'));
  if (pluginJar) {
    const stableName = 'com.spotbugs.runner.jar';
    fse.copySync(path.join(runnerJarFolder, pluginJar), path.join(targetFolder, stableName));
    console.log(`Aliased ${pluginJar} to server/${stableName}`);
  }
}

function mvnw() {
  return process.platform.startsWith('win') ? 'mvnw.cmd' : './mvnw';
}
