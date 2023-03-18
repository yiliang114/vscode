/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const child_process = require('child_process');
const fs = require('fs');
const fse = require('fs-extra');

if (!fs.existsSync('node_modules')) {
	child_process.execSync('PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 ELECTRON_SKIP_BINARY_DOWNLOAD=1 yarn', { stdio: 'inherit' });
}

// Compile
child_process.execSync('yarn gulp vscode-web-min', { stdio: 'inherit' });

// Extract compiled files
if (fs.existsSync('./dist')) {
	fs.rmSync('./dist', { recursive: true });
}
fs.mkdirSync('./dist');

fse.copySync('../vscode-web', './dist');

console.log('build: dist 拷贝完毕。');
