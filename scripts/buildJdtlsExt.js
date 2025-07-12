// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

const cp = require('child_process');
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');

const server_dir = path.resolve('./javaext');

cp.execSync(mvnw() + ' clean package -DskipTests', {
    cwd: server_dir,
    stdio: [0, 1, 2]
});

copy(path.join(server_dir, 'com.spotbugs.runner/target'), path.resolve('server'));

function copy(sourceFolder, targetFolder) {
    const jars = fse.readdirSync(sourceFolder).filter(file => path.extname(file) === '.jar');
    fse.ensureDirSync(targetFolder);
    for (const jar of jars) {
        // remove version from name
        const renamedJar = path.basename(jar).substring(0, path.basename(jar).lastIndexOf('-')) + '.jar';
        fse.copyFileSync(path.join(sourceFolder, jar), path.join(targetFolder, renamedJar));
    }
}

function isWin() {
	return /^win/.test(process.platform);
}

function isMac() {
	return /^darwin/.test(process.platform);
}

function isLinux() {
	return /^linux/.test(process.platform);
}

function mvnw() {
    return isWin() ? "mvnw.cmd" : "./mvnw";
}
