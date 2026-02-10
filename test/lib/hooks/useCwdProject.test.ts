import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cwdCache, ProjectLanguage, useCwdProject } from '../../../src/lib/hooks/useCwdProject.js';
import { sanitizeActorName } from '../../../src/lib/utils.js';

const testDir = join(fileURLToPath(import.meta.url), '..', '..', '..', 'tmp', 'useCwdProject-test');

async function createFileIn(baseDir: string, relativePath: string, content = '') {
	await mkdir(join(baseDir, ...relativePath.split('/').slice(0, -1)), { recursive: true });
	await writeFile(join(baseDir, relativePath), content);
}

async function createPythonPackageIn(baseDir: string, packagePath: string) {
	await createFileIn(baseDir, `${packagePath}/__init__.py`);
}

/** Derive Actor name from entrypoint path (mirrors logic in init.ts) */
function deriveActorName(entrypointPath: string): string {
	const packageName = entrypointPath.includes('.') ? entrypointPath.split('.').pop()! : entrypointPath;
	return sanitizeActorName(packageName);
}

describe('useCwdProject - Python project detection', () => {
	beforeEach(async () => {
		await rm(testDir, { recursive: true, force: true });
		await mkdir(testDir, { recursive: true });
		cwdCache.clear();
	});

	afterAll(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	// Full parametrized matrix:
	//   {CWD with dashes | underscores} × {flat | src container} × {pkg with dashes | underscores} × {init+py | py only | no py}
	//
	// Expected outcomes:
	//   - Valid pkg name (my_package) + __init__.py → Python detected, Actor name = "my-package"
	//   - Valid pkg name + no __init__.py but .py files → near-miss error suggesting __init__.py
	//   - Valid pkg name + no __init__.py and no .py files → unknown (no Python indicators)
	//   - Invalid pkg name (my-package) + __init__.py → near-miss error with rename suggestion
	//   - Invalid pkg name + no __init__.py but .py files → near-miss error suggesting rename + __init__.py
	//   - Invalid pkg name + no __init__.py and no .py files → unknown (no Python indicators)

	interface DetectionTestCase {
		description: string;
		cwdName: string;
		structure: 'flat' | 'src';
		pkgName: string;
		fileSetup: 'init_and_py' | 'py_only' | 'no_py';
		expectedOutcome: 'python' | 'error' | 'unknown';
		expectedEntrypoint: string | null;
		expectedActorName: string | null;
		expectedErrorContains: string | null;
	}

	describe('detection matrix', () => {
		const cases: DetectionTestCase[] = [
			// ── Valid pkg name (my_package) + __init__.py → Python detected ──
			{
				description: 'detects flat package with __init__.py in a hyphenated directory',
				cwdName: 'my-dir',
				structure: 'flat',
				pkgName: 'my_package',
				fileSetup: 'init_and_py',
				expectedOutcome: 'python',
				expectedEntrypoint: 'my_package',
				expectedActorName: 'my-package',
				expectedErrorContains: null,
			},
			{
				description: 'detects flat package with __init__.py in an underscored directory',
				cwdName: 'my_dir',
				structure: 'flat',
				pkgName: 'my_package',
				fileSetup: 'init_and_py',
				expectedOutcome: 'python',
				expectedEntrypoint: 'my_package',
				expectedActorName: 'my-package',
				expectedErrorContains: null,
			},
			{
				description: 'detects package inside src/ container in a hyphenated directory',
				cwdName: 'my-dir',
				structure: 'src',
				pkgName: 'my_package',
				fileSetup: 'init_and_py',
				expectedOutcome: 'python',
				expectedEntrypoint: 'src.my_package',
				expectedActorName: 'my-package',
				expectedErrorContains: null,
			},
			{
				description: 'detects package inside src/ container in an underscored directory',
				cwdName: 'my_dir',
				structure: 'src',
				pkgName: 'my_package',
				fileSetup: 'init_and_py',
				expectedOutcome: 'python',
				expectedEntrypoint: 'src.my_package',
				expectedActorName: 'my-package',
				expectedErrorContains: null,
			},

			// ── Valid pkg name + no __init__.py but .py files → near-miss suggesting __init__.py ──
			{
				description:
					'suggests adding __init__.py for flat valid package with .py files in a hyphenated directory',
				cwdName: 'my-dir',
				structure: 'flat',
				pkgName: 'my_package',
				fileSetup: 'py_only',
				expectedOutcome: 'error',
				expectedEntrypoint: null,
				expectedActorName: null,
				expectedErrorContains: 'add __init__.py',
			},
			{
				description:
					'suggests adding __init__.py for flat valid package with .py files in an underscored directory',
				cwdName: 'my_dir',
				structure: 'flat',
				pkgName: 'my_package',
				fileSetup: 'py_only',
				expectedOutcome: 'error',
				expectedEntrypoint: null,
				expectedActorName: null,
				expectedErrorContains: 'add __init__.py',
			},
			{
				description:
					'suggests adding __init__.py for valid package with .py files inside src/ in a hyphenated directory',
				cwdName: 'my-dir',
				structure: 'src',
				pkgName: 'my_package',
				fileSetup: 'py_only',
				expectedOutcome: 'error',
				expectedEntrypoint: null,
				expectedActorName: null,
				expectedErrorContains: 'add __init__.py',
			},
			{
				description:
					'suggests adding __init__.py for valid package with .py files inside src/ in an underscored directory',
				cwdName: 'my_dir',
				structure: 'src',
				pkgName: 'my_package',
				fileSetup: 'py_only',
				expectedOutcome: 'error',
				expectedEntrypoint: null,
				expectedActorName: null,
				expectedErrorContains: 'add __init__.py',
			},

			// ── Valid pkg name + no __init__.py and no .py files → unknown ──
			{
				description:
					'returns unknown for flat valid directory without any Python files in a hyphenated directory',
				cwdName: 'my-dir',
				structure: 'flat',
				pkgName: 'my_package',
				fileSetup: 'no_py',
				expectedOutcome: 'unknown',
				expectedEntrypoint: null,
				expectedActorName: null,
				expectedErrorContains: null,
			},
			{
				description:
					'returns unknown for flat valid directory without any Python files in an underscored directory',
				cwdName: 'my_dir',
				structure: 'flat',
				pkgName: 'my_package',
				fileSetup: 'no_py',
				expectedOutcome: 'unknown',
				expectedEntrypoint: null,
				expectedActorName: null,
				expectedErrorContains: null,
			},
			{
				description:
					'returns unknown for valid directory without any Python files inside src/ in a hyphenated directory',
				cwdName: 'my-dir',
				structure: 'src',
				pkgName: 'my_package',
				fileSetup: 'no_py',
				expectedOutcome: 'unknown',
				expectedEntrypoint: null,
				expectedActorName: null,
				expectedErrorContains: null,
			},
			{
				description:
					'returns unknown for valid directory without any Python files inside src/ in an underscored directory',
				cwdName: 'my_dir',
				structure: 'src',
				pkgName: 'my_package',
				fileSetup: 'no_py',
				expectedOutcome: 'unknown',
				expectedEntrypoint: null,
				expectedActorName: null,
				expectedErrorContains: null,
			},

			// ── Invalid pkg name (my-package) + __init__.py → near-miss with rename suggestion ──
			{
				description: 'suggests rename for flat hyphenated package with __init__.py in a hyphenated directory',
				cwdName: 'my-dir',
				structure: 'flat',
				pkgName: 'my-package',
				fileSetup: 'init_and_py',
				expectedOutcome: 'error',
				expectedEntrypoint: null,
				expectedActorName: null,
				expectedErrorContains: 'rename to',
			},
			{
				description: 'suggests rename for flat hyphenated package with __init__.py in an underscored directory',
				cwdName: 'my_dir',
				structure: 'flat',
				pkgName: 'my-package',
				fileSetup: 'init_and_py',
				expectedOutcome: 'error',
				expectedEntrypoint: null,
				expectedActorName: null,
				expectedErrorContains: 'rename to',
			},
			{
				description:
					'suggests rename for hyphenated package inside src/ with __init__.py in a hyphenated directory',
				cwdName: 'my-dir',
				structure: 'src',
				pkgName: 'my-package',
				fileSetup: 'init_and_py',
				expectedOutcome: 'error',
				expectedEntrypoint: null,
				expectedActorName: null,
				expectedErrorContains: 'rename to',
			},
			{
				description:
					'suggests rename for hyphenated package inside src/ with __init__.py in an underscored directory',
				cwdName: 'my_dir',
				structure: 'src',
				pkgName: 'my-package',
				fileSetup: 'init_and_py',
				expectedOutcome: 'error',
				expectedEntrypoint: null,
				expectedActorName: null,
				expectedErrorContains: 'rename to',
			},

			// ── Invalid pkg name + no __init__.py but .py files → near-miss suggesting rename + __init__.py ──
			{
				description:
					'suggests rename and __init__.py for flat hyphenated package with .py files in a hyphenated directory',
				cwdName: 'my-dir',
				structure: 'flat',
				pkgName: 'my-package',
				fileSetup: 'py_only',
				expectedOutcome: 'error',
				expectedEntrypoint: null,
				expectedActorName: null,
				expectedErrorContains: 'rename to',
			},
			{
				description:
					'suggests rename and __init__.py for flat hyphenated package with .py files in an underscored directory',
				cwdName: 'my_dir',
				structure: 'flat',
				pkgName: 'my-package',
				fileSetup: 'py_only',
				expectedOutcome: 'error',
				expectedEntrypoint: null,
				expectedActorName: null,
				expectedErrorContains: 'rename to',
			},
			{
				description:
					'suggests rename and __init__.py for hyphenated package with .py files inside src/ in a hyphenated directory',
				cwdName: 'my-dir',
				structure: 'src',
				pkgName: 'my-package',
				fileSetup: 'py_only',
				expectedOutcome: 'error',
				expectedEntrypoint: null,
				expectedActorName: null,
				expectedErrorContains: 'rename to',
			},
			{
				description:
					'suggests rename and __init__.py for hyphenated package with .py files inside src/ in an underscored directory',
				cwdName: 'my_dir',
				structure: 'src',
				pkgName: 'my-package',
				fileSetup: 'py_only',
				expectedOutcome: 'error',
				expectedEntrypoint: null,
				expectedActorName: null,
				expectedErrorContains: 'rename to',
			},

			// ── Invalid pkg name + no __init__.py and no .py files → unknown ──
			{
				description:
					'returns unknown for flat hyphenated directory without any Python files in a hyphenated directory',
				cwdName: 'my-dir',
				structure: 'flat',
				pkgName: 'my-package',
				fileSetup: 'no_py',
				expectedOutcome: 'unknown',
				expectedEntrypoint: null,
				expectedActorName: null,
				expectedErrorContains: null,
			},
			{
				description:
					'returns unknown for flat hyphenated directory without any Python files in an underscored directory',
				cwdName: 'my_dir',
				structure: 'flat',
				pkgName: 'my-package',
				fileSetup: 'no_py',
				expectedOutcome: 'unknown',
				expectedEntrypoint: null,
				expectedActorName: null,
				expectedErrorContains: null,
			},
			{
				description:
					'returns unknown for hyphenated directory without any Python files inside src/ in a hyphenated directory',
				cwdName: 'my-dir',
				structure: 'src',
				pkgName: 'my-package',
				fileSetup: 'no_py',
				expectedOutcome: 'unknown',
				expectedEntrypoint: null,
				expectedActorName: null,
				expectedErrorContains: null,
			},
			{
				description:
					'returns unknown for hyphenated directory without any Python files inside src/ in an underscored directory',
				cwdName: 'my_dir',
				structure: 'src',
				pkgName: 'my-package',
				fileSetup: 'no_py',
				expectedOutcome: 'unknown',
				expectedEntrypoint: null,
				expectedActorName: null,
				expectedErrorContains: null,
			},
		];

		it.each(cases)('$description', async ({
			cwdName,
			structure,
			pkgName,
			fileSetup,
			expectedOutcome,
			expectedEntrypoint,
			expectedActorName,
			expectedErrorContains,
		}) => {
			const projectDir = join(testDir, cwdName);
			await mkdir(projectDir, { recursive: true });

			const pkgPath = structure === 'src' ? `src/${pkgName}` : pkgName;

			if (fileSetup === 'init_and_py') {
				await createPythonPackageIn(projectDir, pkgPath);
				await createFileIn(projectDir, `${pkgPath}/main.py`, 'print("hello")');
			} else if (fileSetup === 'py_only') {
				await createFileIn(projectDir, `${pkgPath}/main.py`, 'print("hello")');
			} else {
				// no_py: create directory with a non-Python file
				await createFileIn(projectDir, `${pkgPath}/readme.txt`, 'not python');
			}

			const result = await useCwdProject({ cwd: projectDir });

			if (expectedOutcome === 'python') {
				expect(result.isOk()).toBe(true);
				const project = result.unwrap();
				expect(project.type).toBe(ProjectLanguage.Python);
				expect(project.entrypoint?.path).toBe(expectedEntrypoint);
				expect(deriveActorName(project.entrypoint!.path!)).toBe(expectedActorName);
			} else if (expectedOutcome === 'error') {
				expect(result.isErr()).toBe(true);
				expect(result.unwrapErr().message).toContain(expectedErrorContains!);
			} else {
				expect(result.isOk()).toBe(true);
				expect(result.unwrap().type).toBe(ProjectLanguage.Unknown);
			}
		});
	});

	// Individual cases

	describe('JavaScript and Python coexist', () => {
		it('should prefer JavaScript when both package.json and Python package exist', async () => {
			await createFileIn(testDir, 'package.json', '{"name": "test", "scripts": {"start": "node index.js"}}');
			await createPythonPackageIn(testDir, 'my_package');

			const result = await useCwdProject({ cwd: testDir });

			expect(result.isOk()).toBe(true);
			expect(result.unwrap().type).toBe(ProjectLanguage.JavaScript);
		});
	});

	describe('multiple packages', () => {
		it('should error when multiple flat packages exist', async () => {
			await createPythonPackageIn(testDir, 'package_a');
			await createPythonPackageIn(testDir, 'package_b');

			const result = await useCwdProject({ cwd: testDir });

			expect(result.isErr()).toBe(true);
			const error = result.unwrapErr();
			expect(error.message).toContain('Multiple Python packages found');
			expect(error.message).toContain('package_a');
			expect(error.message).toContain('package_b');
			expect(error.message).toContain('--entrypoint');
		});

		it('should error when multiple packages exist in src/ container', async () => {
			await createPythonPackageIn(testDir, 'src/package_a');
			await createPythonPackageIn(testDir, 'src/package_b');

			const result = await useCwdProject({ cwd: testDir });

			expect(result.isErr()).toBe(true);
			const error = result.unwrapErr();
			expect(error.message).toContain('Multiple Python packages found');
			expect(error.message).toContain('--entrypoint');
		});
	});

	describe('Python files but no package', () => {
		it('should error when loose .py files exist without package structure', async () => {
			await createFileIn(testDir, 'main.py', 'print("hello")');

			const result = await useCwdProject({ cwd: testDir });

			expect(result.isErr()).toBe(true);
			const error = result.unwrapErr();
			expect(error.message).toContain('No Python package found');
			expect(error.message).toContain('no valid package structure');
		});
	});

	describe('no Python project at all', () => {
		it('should return Unknown when no Python files or packages present', async () => {
			await createFileIn(testDir, 'readme.txt', 'Hello');

			const result = await useCwdProject({ cwd: testDir });

			expect(result.isOk()).toBe(true);
			expect(result.unwrap().type).toBe(ProjectLanguage.Unknown);
		});
	});

	describe('src/ as a package (not a container)', () => {
		it('should detect src/ itself as a Python package when it has __init__.py', async () => {
			await createPythonPackageIn(testDir, 'src');
			await createFileIn(testDir, 'src/__main__.py', 'print("hello")');
			await createFileIn(testDir, 'src/main.py', 'print("hello")');

			const result = await useCwdProject({ cwd: testDir });

			expect(result.isOk()).toBe(true);
			const project = result.unwrap();
			expect(project.type).toBe(ProjectLanguage.Python);
			expect(project.entrypoint?.path).toBe('src');
		});

		it('should not search inside src/ for packages when src/ is itself a package', async () => {
			// src/ is a package, and has a sub-package inside — should still detect src/ as the only package
			await createPythonPackageIn(testDir, 'src');
			await createFileIn(testDir, 'src/__main__.py', 'print("hello")');
			await createPythonPackageIn(testDir, 'src/sub_package');

			const result = await useCwdProject({ cwd: testDir });

			expect(result.isOk()).toBe(true);
			const project = result.unwrap();
			expect(project.type).toBe(ProjectLanguage.Python);
			expect(project.entrypoint?.path).toBe('src');
		});
	});

	describe('missing __main__.py warning', () => {
		it('should warn when detected package has __init__.py but no __main__.py', async () => {
			await createPythonPackageIn(testDir, 'my_package');
			await createFileIn(testDir, 'my_package/main.py', 'print("hello")');

			const result = await useCwdProject({ cwd: testDir });

			expect(result.isOk()).toBe(true);
			const project = result.unwrap();
			expect(project.type).toBe(ProjectLanguage.Python);
			expect(project.warnings).toBeDefined();
			expect(project.warnings!.length).toBeGreaterThan(0);
			expect(project.warnings![0]).toContain('__main__.py');
		});

		it('should not warn when package has both __init__.py and __main__.py', async () => {
			await createPythonPackageIn(testDir, 'my_package');
			await createFileIn(testDir, 'my_package/__main__.py', 'print("hello")');

			const result = await useCwdProject({ cwd: testDir });

			expect(result.isOk()).toBe(true);
			const project = result.unwrap();
			expect(project.type).toBe(ProjectLanguage.Python);
			expect(project.warnings ?? []).toHaveLength(0);
		});
	});
});
