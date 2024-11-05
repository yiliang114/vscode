/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const gulp = require('gulp');
const path = require('path');
const util = require('./lib/util');
const { getVersion } = require('./lib/getVersion');
const task = require('./lib/task');
const optimize = require('./lib/optimize');
const es = require('event-stream');
const File = require('vinyl');
const i18n = require('./lib/i18n');
const standalone = require('./lib/standalone');
const cp = require('child_process');
const compilation = require('./lib/compilation');
const monacoapi = require('./lib/monaco-api');
const fs = require('fs');

const root = path.dirname(__dirname);
const sha1 = getVersion(root);
const semver = require('./monaco/package.json').version;
const headerVersion = semver + '(' + sha1 + ')';

// Build

// 构建 Monaco Editor Core
// 独立打包生一个 叫 monaco-editor-core 的 npm 包，而该包最终作为 monaco-editor 的核心依赖。
// monaco 被可以把这里看作一个精简版的编辑器，提供了最基础的编辑功能，对外暴露各种 API, 由具体的外部服务决定编辑器的行为，目前市面上很多代码编辑器工具就是基于 monaco。
// 所以 editor 路径下的代码不能加任何 vscode 专有的功能， 并且只依赖公用服务。
const editorEntryPoints = [
	{
		name: 'vs/editor/editor.main',
		include: [],
		exclude: ['vs/css'],
		prepend: [
			{ path: 'out-editor-build/vs/css.js', amdModuleId: 'vs/css' }
		],
	},
	// TODO: 为什么有一个 worker？
	{
		name: 'vs/base/common/worker/simpleWorker',
		include: ['vs/editor/common/services/editorSimpleWorker'],
		exclude: [],
		prepend: [
			{ path: 'vs/loader.js' },
			{ path: 'vs/base/worker/workerMain.js' }
		],
		dest: 'vs/base/worker/workerMain.js'
	}
];

const editorResources = [
	'out-editor-build/vs/base/browser/ui/codicons/**/*.ttf'
];

// 打包产物中为每一个文件添加头部
const BUNDLED_FILE_HEADER = [
	'/*!-----------------------------------------------------------',
	' * Copyright (c) Microsoft Corporation. All rights reserved.',
	' * Version: ' + headerVersion,
	' * Released under the MIT license',
	' * https://github.com/microsoft/vscode/blob/main/LICENSE.txt',
	' *-----------------------------------------------------------*/',
	''
].join('\n');

// 非稳定版 monaco editor 构建的语言包，可能以前在非稳定版构建时不会构建全量语言，可能是为了减少构建时间。
// 另外一点，从这里了解到，monaco 也有 stable 版和 insider 版区分。
const languages = i18n.defaultLanguages.concat([]);  // i18n.defaultLanguages.concat(process.env.VSCODE_QUALITY !== 'stable' ? i18n.extraLanguages : []);

// 此处的 task.define 并不是 gulp 声明任务，而只是单纯因为 gulp 任务运行需要很多额外的属性，例如 displayName 等，task.define 就是对 Task 实例属性做了一层包装
const extractEditorSrcTask = task.define('extract-editor-src', () => {
	const apiusages = monacoapi.execute().usageContent;
	const extrausages = fs.readFileSync(path.join(root, 'build', 'monaco', 'monaco.usage.recipe')).toString();
	standalone.extractEditor({
		sourcesRoot: path.join(root, 'src'),
		// 几个主要的入口文件
		entryPoints: [
			'vs/editor/editor.main',
			'vs/editor/editor.worker',
			'vs/base/worker/workerMain',
		],
		inlineEntryPoints: [
			apiusages,
			extrausages
		],
		shakeLevel: 2, // 0-Files, 1-InnerFile, 2-ClassMembers
		importIgnorePattern: /\.css$/,
		destRoot: path.join(root, 'out-editor-src'),
		redirects: {
			'@vscode/tree-sitter-wasm': '../node_modules/@vscode/tree-sitter-wasm/wasm/tree-sitter-web',
		}
	});
});

// TODO: 关于 ts 的 mangling 可以写一篇文章？
// Disable mangling for the editor, as it complicates debugging & quite a few users rely on private/protected fields.
// 禁用编辑器的 mangling，因为它使调试复杂化 & 相当多的用户依赖于私有/受保护的字段。
// Disable NLS task to remove english strings to preserve backwards compatibility when we removed the `vs/nls!` AMD plugin.
const compileEditorAMDTask = task.define('compile-editor-amd', compilation.compileTask('out-editor-src', 'out-editor-build', true, { disableMangle: true, preserveEnglish: true }));

const bundleEditorAMDTask = task.define('bundle-editor-amd', optimize.bundleTask(
	{
		out: 'out-editor',
		esm: {
			src: 'out-editor-build',
			entryPoints: editorEntryPoints,
			resources: editorResources
		}
	}
));

// minify 化 amd 形式的 monaco-editor-core. 通常这回事最后一步。
// amd monaco-editor-core 构建流程： src 中代码提取到 out-editor-src，然后通过 amd 构建到 out-editor-build，接着优化构建产物到 out-editor，最后 minify 到 out-editor
const minifyEditorAMDTask = task.define('minify-editor-amd', optimize.minifyTask('out-editor'));

// 提取 esm 形式的代码需要额外的任务
const createESMSourcesAndResourcesTask = task.define('extract-editor-esm', () => {
	standalone.createESMSourcesAndResources2({
		srcFolder: './out-editor-src',
		outFolder: './out-editor-esm',
		outResourcesFolder: './out-monaco-editor-core/esm',
		ignores: [
			'inlineEntryPoint:0.ts',
			'inlineEntryPoint:1.ts',
			'vs/loader.js',
			'vs/base/worker/workerMain.ts',
		],
		renames: {
		}
	});
});

const compileEditorESMTask = task.define('compile-editor-esm', () => {
	const KEEP_PREV_ANALYSIS = false;
	const FAIL_ON_PURPOSE = false;
	console.log(`Launching the TS compiler at ${path.join(__dirname, '../out-editor-esm')}...`);
	let result;
	if (process.platform === 'win32') {
		result = cp.spawnSync(`..\\node_modules\\.bin\\tsc.cmd`, {
			cwd: path.join(__dirname, '../out-editor-esm'),
			shell: true
		});
	} else {
		result = cp.spawnSync(`node`, [`../node_modules/.bin/tsc`], {
			cwd: path.join(__dirname, '../out-editor-esm')
		});
	}

	console.log(result.stdout.toString());
	console.log(result.stderr.toString());

	if (FAIL_ON_PURPOSE || result.status !== 0) {
		console.log(`The TS Compilation failed, preparing analysis folder...`);
		const destPath = path.join(__dirname, '../../vscode-monaco-editor-esm-analysis');
		const keepPrevAnalysis = (KEEP_PREV_ANALYSIS && fs.existsSync(destPath));
		const cleanDestPath = (keepPrevAnalysis ? Promise.resolve() : util.rimraf(destPath)());
		return cleanDestPath.then(() => {
			// build a list of files to copy
			const files = util.rreddir(path.join(__dirname, '../out-editor-esm'));

			if (!keepPrevAnalysis) {
				fs.mkdirSync(destPath);

				// initialize a new repository
				cp.spawnSync(`git`, [`init`], {
					cwd: destPath
				});

				// copy files from src
				for (const file of files) {
					const srcFilePath = path.join(__dirname, '../src', file);
					const dstFilePath = path.join(destPath, file);
					if (fs.existsSync(srcFilePath)) {
						util.ensureDir(path.dirname(dstFilePath));
						const contents = fs.readFileSync(srcFilePath).toString().replace(/\r\n|\r|\n/g, '\n');
						fs.writeFileSync(dstFilePath, contents);
					}
				}

				// create an initial commit to diff against
				cp.spawnSync(`git`, [`add`, `.`], {
					cwd: destPath
				});

				// create the commit
				cp.spawnSync(`git`, [`commit`, `-m`, `"original sources"`, `--no-gpg-sign`], {
					cwd: destPath
				});
			}

			// copy files from tree shaken src
			for (const file of files) {
				const srcFilePath = path.join(__dirname, '../out-editor-src', file);
				const dstFilePath = path.join(destPath, file);
				if (fs.existsSync(srcFilePath)) {
					util.ensureDir(path.dirname(dstFilePath));
					const contents = fs.readFileSync(srcFilePath).toString().replace(/\r\n|\r|\n/g, '\n');
					fs.writeFileSync(dstFilePath, contents);
				}
			}

			console.log(`Open in VS Code the folder at '${destPath}' and you can analyze the compilation error`);
			throw new Error('Standalone Editor compilation failed. If this is the build machine, simply launch `npm run gulp editor-distro` on your machine to further analyze the compilation problem.');
		});
	}
});

/**
 * @param {string} contents
 */
function toExternalDTS(contents) {
	const lines = contents.split(/\r\n|\r|\n/);
	let killNextCloseCurlyBrace = false;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		if (killNextCloseCurlyBrace) {
			if ('}' === line) {
				lines[i] = '';
				killNextCloseCurlyBrace = false;
				continue;
			}

			if (line.indexOf('    ') === 0) {
				lines[i] = line.substr(4);
			} else if (line.charAt(0) === '\t') {
				lines[i] = line.substr(1);
			}

			continue;
		}

		if ('declare namespace monaco {' === line) {
			lines[i] = '';
			killNextCloseCurlyBrace = true;
			continue;
		}

		if (line.indexOf('declare namespace monaco.') === 0) {
			lines[i] = line.replace('declare namespace monaco.', 'export namespace ');
		}

		if (line.indexOf('declare let MonacoEnvironment') === 0) {
			lines[i] = `declare global {\n    let MonacoEnvironment: Environment | undefined;\n}`;
		}

		if (line.indexOf('\tMonacoEnvironment?') === 0) {
			lines[i] = `    MonacoEnvironment?: Environment | undefined;`;
		}
	}
	return lines.join('\n').replace(/\n\n\n+/g, '\n\n');
}

/**
 * @param {{ (path: string): boolean }} testFunc
 */
function filterStream(testFunc) {
	return es.through(function (data) {
		if (!testFunc(data.relative)) {
			return;
		}
		this.emit('data', data);
	});
}

const finalEditorResourcesTask = task.define('final-editor-resources', () => {
	return es.merge(
		// other assets
		es.merge(
			gulp.src('build/monaco/LICENSE'),
			gulp.src('build/monaco/ThirdPartyNotices.txt'),
			gulp.src('src/vs/monaco.d.ts')
		).pipe(gulp.dest('out-monaco-editor-core')),

		// place the .d.ts in the esm folder
		gulp.src('src/vs/monaco.d.ts')
			.pipe(es.through(function (data) {
				this.emit('data', new File({
					path: data.path.replace(/monaco\.d\.ts/, 'editor.api.d.ts'),
					base: data.base,
					contents: Buffer.from(toExternalDTS(data.contents.toString()))
				}));
			}))
			.pipe(gulp.dest('out-monaco-editor-core/esm/vs/editor')),

		// package.json
		gulp.src('build/monaco/package.json')
			.pipe(es.through(function (data) {
				const json = JSON.parse(data.contents.toString());
				json.private = false;
				data.contents = Buffer.from(JSON.stringify(json, null, '  '));
				this.emit('data', data);
			}))
			.pipe(gulp.dest('out-monaco-editor-core')),

		// version.txt
		gulp.src('build/monaco/version.txt')
			.pipe(es.through(function (data) {
				data.contents = Buffer.from(`monaco-editor-core: https://github.com/microsoft/vscode/tree/${sha1}`);
				this.emit('data', data);
			}))
			.pipe(gulp.dest('out-monaco-editor-core')),

		// README.md
		gulp.src('build/monaco/README-npm.md')
			.pipe(es.through(function (data) {
				this.emit('data', new File({
					path: data.path.replace(/README-npm\.md/, 'README.md'),
					base: data.base,
					contents: data.contents
				}));
			}))
			.pipe(gulp.dest('out-monaco-editor-core')),

		// dev folder
		es.merge(
			gulp.src('out-editor/**/*')
		).pipe(gulp.dest('out-monaco-editor-core/dev')),

		// min folder
		es.merge(
			gulp.src('out-editor-min/**/*')
		).pipe(filterStream(function (path) {
			// no map files
			return !/(\.js\.map$)|(nls\.metadata\.json$)|(bundleInfo\.json$)/.test(path);
		})).pipe(es.through(function (data) {
			// tweak the sourceMappingURL
			if (!/\.js$/.test(data.path)) {
				this.emit('data', data);
				return;
			}

			const relativePathToMap = path.relative(path.join(data.relative), path.join('min-maps', data.relative + '.map'));

			let strContents = data.contents.toString();
			const newStr = '//# sourceMappingURL=' + relativePathToMap.replace(/\\/g, '/');
			strContents = strContents.replace(/\/\/# sourceMappingURL=[^ ]+$/, newStr);

			data.contents = Buffer.from(strContents);
			this.emit('data', data);
		})).pipe(gulp.dest('out-monaco-editor-core/min')),

		// min-maps folder
		es.merge(
			gulp.src('out-editor-min/**/*')
		).pipe(filterStream(function (path) {
			// no map files
			return /\.js\.map$/.test(path);
		})).pipe(gulp.dest('out-monaco-editor-core/min-maps'))
	);
});

// 从 vscode 源码中提取 editor 代码
gulp.task('extract-editor-src',
	task.series(
		util.rimraf('out-editor-src'),
		extractEditorSrcTask
	)
);

// monaco amd 版构建
gulp.task('editor-distro',
	task.series(
		task.parallel(
			util.rimraf('out-editor-src'),
			util.rimraf('out-editor-build'),
			util.rimraf('out-editor-esm'),
			util.rimraf('out-monaco-editor-core'),
			util.rimraf('out-editor'),
			util.rimraf('out-editor-min')
		),
		extractEditorSrcTask,
		task.parallel(
			task.series(
				compileEditorAMDTask,
				bundleEditorAMDTask,
				minifyEditorAMDTask
			),
			task.series(
				createESMSourcesAndResourcesTask,
				compileEditorESMTask,
			)
		),
		finalEditorResourcesTask
	)
);

// 构建 monaco esm 版本.  Github Action 中的 monaco-editor.yml 中执行的主要构建步骤。
gulp.task('editor-esm',
	task.series(
		task.parallel(
			util.rimraf('out-editor-src'),
			util.rimraf('out-editor-esm'),
			util.rimraf('out-monaco-editor-core'),
		),
		extractEditorSrcTask, // 提取 editor 源码
		createESMSourcesAndResourcesTask, // 创建 esm 源码
		compileEditorESMTask, // 编译
		// appendJSToESMImportsTask, // 追加 js。 1.94 之后已经不需要了。
	)
);

// 构建 monaco d.ts 类型核心任务
gulp.task('monacodts', task.define('monacodts', () => {
	const result = monacoapi.execute();
	fs.writeFileSync(result.filePath, result.content);
	fs.writeFileSync(path.join(root, 'src/vs/editor/common/standalone/standaloneEnums.ts'), result.enums);
	return Promise.resolve(true);
}));

//#region monaco type checking

function createTscCompileTask(watch) {
	return () => {
		const createReporter = require('./lib/reporter').createReporter;

		return new Promise((resolve, reject) => {
			const args = ['./node_modules/.bin/tsc', '-p', './src/tsconfig.monaco.json', '--noEmit'];
			if (watch) {
				args.push('-w');
			}
			const child = cp.spawn(`node`, args, {
				cwd: path.join(__dirname, '..'),
				// stdio: [null, 'pipe', 'inherit']
			});
			const errors = [];
			const reporter = createReporter('monaco');

			/** @type {NodeJS.ReadWriteStream | undefined} */
			let report;
			const magic = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g; // https://stackoverflow.com/questions/25245716/remove-all-ansi-colors-styles-from-strings

			child.stdout.on('data', data => {
				let str = String(data);
				str = str.replace(magic, '').trim();
				if (str.indexOf('Starting compilation') >= 0 || str.indexOf('File change detected') >= 0) {
					errors.length = 0;
					report = reporter.end(false);

				} else if (str.indexOf('Compilation complete') >= 0) {
					report.end();

				} else if (str) {
					const match = /(.*\(\d+,\d+\): )(.*: )(.*)/.exec(str);
					if (match) {
						// trying to massage the message so that it matches the gulp-tsb error messages
						// e.g. src/vs/base/common/strings.ts(663,5): error TS2322: Type '1234' is not assignable to type 'string'.
						const fullpath = path.join(root, match[1]);
						const message = match[3];
						reporter(fullpath + message);
					} else {
						reporter(str);
					}
				}
			});
			child.on('exit', resolve);
			child.on('error', reject);
		});
	};
}

// 类型、产物的 check 任务
const monacoTypecheckWatchTask = task.define('monaco-typecheck-watch', createTscCompileTask(true));
exports.monacoTypecheckWatchTask = monacoTypecheckWatchTask;

const monacoTypecheckTask = task.define('monaco-typecheck', createTscCompileTask(false));
exports.monacoTypecheckTask = monacoTypecheckTask;

//#endregion
