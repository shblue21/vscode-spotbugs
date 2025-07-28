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
    const jars = fse.readdirSync(runnerJarFolder).filter(file => path.extname(file) === '.jar');
    fse.ensureDirSync(targetFolder);

    for (const jar of jars) {
        fse.copySync(path.join(runnerJarFolder, jar), path.join(targetFolder, jar));
        console.log(`Copied ${jar} to server/`);
    }
}

function mvnw() {
    return process.platform.startsWith('win') ? 'mvnw.cmd' : './mvnw';
}