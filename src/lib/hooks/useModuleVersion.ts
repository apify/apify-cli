import { none, some, type Option } from '@sapphire/result';
import { execa } from 'execa';

import { ProjectLanguage, type CwdProject } from './useCwdProject.js';

export interface UseModuleVersionInput {
	moduleName: string;
	project: CwdProject;
}

const jsScript = (mod: string) =>
	`
(async () => {
	const [nodeModule, process, path, fs] = await Promise.all([
		import('node:module'),
		import('node:process'),
		import('node:path'),
		import('node:fs/promises'),
	]);

	/* we fake a script file here because otherwise node AND deno will fail to resolve modules, but bun works -.- */
	const dirname = path.join(process.cwd(), '__apify_cli_fetch_module_version__.js');

	const _require = nodeModule.createRequire(dirname);

	try {
		const modulePath = _require.resolve('${mod}');
		const moduleDir = path.dirname(modulePath);

		const packageJson = await fs.readFile(path.join(moduleDir, 'package.json'), 'utf8').catch(() => null);

		if (!packageJson) {
			console.log('n/a');
			return;
		}

		const packageJsonObj = JSON.parse(packageJson);
		console.log(packageJsonObj.version);
	} catch {
		console.log('n/a');
	}
})();
`
		.replaceAll('\n', ' ')
		.replaceAll('\t', ' ');

const pyScript = (mod: string) => `
try:
	import ${mod}
	print(${mod}.__version__)
except:
	print('n/a')
`;

const moduleVersionScripts: Record<string, (mod: string) => string[]> = {
	node(mod) {
		const script = jsScript(mod);

		return ['-e', `"${script}"`];
	},
	deno(mod) {
		const script = jsScript(mod);

		return ['eval', `"${script}"`];
	},
	bun(mod) {
		const script = jsScript(mod);

		return ['--eval', `"${script}"`];
	},
	python(mod) {
		const script = pyScript(mod);

		return ['-c', `"${script}"`];
	},
};

export async function useModuleVersion({ moduleName, project }: UseModuleVersionInput): Promise<Option<string>> {
	if (!project.runtime) {
		return none;
	}

	let moduleVersionScriptKey: string;

	if (project.type === ProjectLanguage.JavaScript) {
		moduleVersionScriptKey = project.runtime.runtimeShorthand || 'node';
	} else if (project.type === ProjectLanguage.Python || project.type === ProjectLanguage.Scrapy) {
		moduleVersionScriptKey = 'python';
	} else {
		return none;
	}

	const args = moduleVersionScripts[moduleVersionScriptKey]?.(moduleName);

	if (!args) {
		return none;
	}

	try {
		const result = await execa(project.runtime.executablePath, args, {
			shell: true,
			windowsHide: true,
		});

		if (result.stdout.trim() === 'n/a') {
			return none;
		}

		return some(result.stdout.trim());
	} catch {
		return none;
	}
}
