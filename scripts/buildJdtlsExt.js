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
  // by renaming the copied artifact in server/ to a constant filename.
  const pluginJar = jars.find((j) => j.startsWith('com.spotbugs.runner-') && j.endsWith('.jar'));
  if (pluginJar) {
    const stableName = 'com.spotbugs.runner.jar';
    const src = path.join(targetFolder, pluginJar);
    const dest = path.join(targetFolder, stableName);
    try {
      fse.moveSync(src, dest, { overwrite: true });
      console.log(`Renamed ${pluginJar} -> ${stableName}`);
    } catch (e) {
      console.warn(`Failed to rename ${pluginJar} to ${stableName}: ${e?.message || e}`);
    }
  }
}

function mvnw() {
  return process.platform.startsWith('win') ? 'mvnw.cmd' : './mvnw';
}
