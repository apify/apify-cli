import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cwdCache, ProjectLanguage, useCwdProject } from '../../../src/lib/hooks/useCwdProject.js';

const testDir = join(fileURLToPath(import.meta.url), '..', '..', '..', 'tmp', 'useCwdProject-test');

async function createFile(path: string, content = '') {
	await mkdir(join(testDir, ...path.split('/').slice(0, -1)), { recursive: true });
	await writeFile(join(testDir, path), content);
}

async function createPythonPackage(packagePath: string) {
	await createFile(`${packagePath}/__init__.py`);
}

// Helper to create a requirements.txt (Python indicator)
async function createRequirementsTxt() {
	await createFile('requirements.txt', 'apify>=1.0.0');
}

describe('useCwdProject - Python project detection', () => {
	beforeEach(async () => {
		// Clean up test directory and cache before each test
		await rm(testDir, { recursive: true, force: true });
		await mkdir(testDir, { recursive: true });
		cwdCache.clear();
	});

	afterAll(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	describe('flat package structure', () => {
		it('should detect a flat package at root level', async () => {
			// Structure:
			// requirements.txt
			// my_package/
			//   __init__.py
			//   main.py
			await createRequirementsTxt();
			await createPythonPackage('my_package');
			await createFile('my_package/main.py', 'print("hello")');

			const result = await useCwdProject({ cwd: testDir });

			expect(result.isOk()).toBe(true);
			const project = result.unwrap();
			expect(project.type).toBe(ProjectLanguage.Python);
			expect(project.entrypoint?.path).toBe('my_package');
		});

		it('should detect package with underscore name', async () => {
			// Structure:
			// requirements.txt
			// my_cool_package/
			//   __init__.py
			await createRequirementsTxt();
			await createPythonPackage('my_cool_package');

			const result = await useCwdProject({ cwd: testDir });

			expect(result.isOk()).toBe(true);
			const project = result.unwrap();
			expect(project.type).toBe(ProjectLanguage.Python);
			expect(project.entrypoint?.path).toBe('my_cool_package');
		});
	});

	describe('src container structure', () => {
		it('should detect package inside src/ when src is not a package', async () => {
			// Structure:
			// requirements.txt
			// src/
			//   my_package/
			//     __init__.py
			//     main.py
			// (src/ has no __init__.py, so it's just a container)
			await createRequirementsTxt();
			await createPythonPackage('src/my_package');
			await createFile('src/my_package/main.py', 'print("hello")');

			const result = await useCwdProject({ cwd: testDir });

			expect(result.isOk()).toBe(true);
			const project = result.unwrap();
			expect(project.type).toBe(ProjectLanguage.Python);
			expect(project.entrypoint?.path).toBe('src.my_package');
		});

		it('should detect package inside src/ with requirements.txt', async () => {
			// Structure:
			// requirements.txt
			// src/
			//   my_package/
			//     __init__.py
			await createRequirementsTxt();
			await createPythonPackage('src/my_package');

			const result = await useCwdProject({ cwd: testDir });

			expect(result.isOk()).toBe(true);
			const project = result.unwrap();
			expect(project.type).toBe(ProjectLanguage.Python);
			expect(project.entrypoint?.path).toBe('src.my_package');
		});
	});

	describe('package with subpackages (like Scrapy)', () => {
		it('should detect src as the only package when it has __init__.py', async () => {
			// Structure (typical Scrapy template):
			// requirements.txt
			// src/
			//   __init__.py
			//   __main__.py
			//   main.py
			//   spiders/
			//     __init__.py
			//     my_spider.py
			// Here src/ IS a package, and spiders/ is a subpackage (not a separate top-level package)
			await createRequirementsTxt();
			await createPythonPackage('src');
			await createFile('src/__main__.py', 'from .main import main; main()');
			await createFile('src/main.py', 'def main(): pass');
			await createPythonPackage('src/spiders');
			await createFile('src/spiders/my_spider.py', 'class MySpider: pass');

			const result = await useCwdProject({ cwd: testDir });

			expect(result.isOk()).toBe(true);
			const project = result.unwrap();
			expect(project.type).toBe(ProjectLanguage.Python);
			// Should only find 'src', not 'src' AND 'src.spiders'
			expect(project.entrypoint?.path).toBe('src');
		});

		it('should detect package with deeply nested subpackages', async () => {
			// Structure:
			// requirements.txt
			// my_app/
			//   __init__.py
			//   core/
			//     __init__.py
			//   utils/
			//     __init__.py
			//     helpers/
			//       __init__.py
			await createRequirementsTxt();
			await createPythonPackage('my_app');
			await createPythonPackage('my_app/core');
			await createPythonPackage('my_app/utils');
			await createPythonPackage('my_app/utils/helpers');

			const result = await useCwdProject({ cwd: testDir });

			expect(result.isOk()).toBe(true);
			const project = result.unwrap();
			expect(project.type).toBe(ProjectLanguage.Python);
			// Should only find 'my_app' as the top-level package
			expect(project.entrypoint?.path).toBe('my_app');
		});
	});

	describe('multiple packages (error case)', () => {
		it('should error when multiple top-level packages exist at root', async () => {
			// Structure:
			// requirements.txt
			// package_a/
			//   __init__.py
			// package_b/
			//   __init__.py
			await createRequirementsTxt();
			await createPythonPackage('package_a');
			await createPythonPackage('package_b');

			const result = await useCwdProject({ cwd: testDir });

			expect(result.isErr()).toBe(true);
			const error = result.unwrapErr();
			expect(error.message).toContain('Multiple Python packages found');
			expect(error.message).toContain('package_a');
			expect(error.message).toContain('package_b');
		});

		it('should error when multiple packages exist in src/ container', async () => {
			// Structure:
			// requirements.txt
			// src/
			//   package_a/
			//     __init__.py
			//   package_b/
			//     __init__.py
			// (src/ has no __init__.py)
			await createRequirementsTxt();
			await createPythonPackage('src/package_a');
			await createPythonPackage('src/package_b');

			const result = await useCwdProject({ cwd: testDir });

			expect(result.isErr()).toBe(true);
			const error = result.unwrapErr();
			expect(error.message).toContain('Multiple Python packages found');
		});
	});

	describe('no package found (error case)', () => {
		it('should error when Python files exist but no valid package structure', async () => {
			// Structure:
			// main.py (no package, just loose files)
			// requirements.txt
			await createFile('requirements.txt', 'apify>=1.0.0');
			await createFile('main.py', 'print("hello")');

			const result = await useCwdProject({ cwd: testDir });

			expect(result.isErr()).toBe(true);
			const error = result.unwrapErr();
			expect(error.message).toContain('No Python package found');
		});

		it('should error when directory exists but has no __init__.py', async () => {
			// Structure:
			// main.py (root level Python file - triggers Python detection)
			// my_package/
			//   other.py (no __init__.py in my_package!)
			// requirements.txt
			await createFile('requirements.txt', 'apify>=1.0.0');
			await createFile('main.py', 'print("root")'); // Python file in root triggers detection
			await mkdir(join(testDir, 'my_package'), { recursive: true });
			await createFile('my_package/other.py', 'print("hello")');

			const result = await useCwdProject({ cwd: testDir });

			expect(result.isErr()).toBe(true);
			const error = result.unwrapErr();
			// Should detect Python files but no valid package structure
			expect(error.message).toContain('No Python package found');
			expect(error.message).toContain('no valid package structure');
		});
	});

	describe('edge cases', () => {
		it('should ignore hidden directories', async () => {
			// Structure:
			// requirements.txt
			// .venv/
			//   __init__.py (should be ignored)
			// my_package/
			//   __init__.py
			await createRequirementsTxt();
			await createPythonPackage('.venv');
			await createPythonPackage('my_package');

			const result = await useCwdProject({ cwd: testDir });

			expect(result.isOk()).toBe(true);
			const project = result.unwrap();
			expect(project.entrypoint?.path).toBe('my_package');
		});

		it('should ignore directories starting with underscore', async () => {
			// Structure:
			// requirements.txt
			// __pycache__/
			//   __init__.py (should be ignored)
			// my_package/
			//   __init__.py
			await createRequirementsTxt();
			await createPythonPackage('__pycache__');
			await createPythonPackage('my_package');

			const result = await useCwdProject({ cwd: testDir });

			expect(result.isOk()).toBe(true);
			const project = result.unwrap();
			expect(project.entrypoint?.path).toBe('my_package');
		});

		it('should ignore directories with invalid Python identifier names', async () => {
			// Structure:
			// requirements.txt
			// my-package/ (hyphen is invalid in Python identifiers)
			//   __init__.py
			// my_package/
			//   __init__.py
			await createRequirementsTxt();
			await createPythonPackage('my-package');
			await createPythonPackage('my_package');

			const result = await useCwdProject({ cwd: testDir });

			expect(result.isOk()).toBe(true);
			const project = result.unwrap();
			// Should only find my_package, not my-package
			expect(project.entrypoint?.path).toBe('my_package');
		});

		it('should detect project with pyproject.toml', async () => {
			// Structure:
			// pyproject.toml
			// my_package/
			//   __init__.py
			await createFile('pyproject.toml', '[project]\nname = "my-package"');
			await createPythonPackage('my_package');

			const result = await useCwdProject({ cwd: testDir });

			expect(result.isOk()).toBe(true);
			const project = result.unwrap();
			expect(project.type).toBe(ProjectLanguage.Python);
			expect(project.entrypoint?.path).toBe('my_package');
		});

		it('should not detect Python when no indicators present', async () => {
			// Structure:
			// Empty directory or non-Python files only
			await createFile('readme.txt', 'Hello');

			const result = await useCwdProject({ cwd: testDir });

			expect(result.isOk()).toBe(true);
			const project = result.unwrap();
			expect(project.type).toBe(ProjectLanguage.Unknown);
		});
	});

	describe('mixed project detection', () => {
		it('should error when both Python and Node.js indicators are present', async () => {
			// Structure:
			// package.json
			// requirements.txt
			// my_package/
			//   __init__.py
			await createFile('package.json', '{"name": "test"}');
			await createFile('requirements.txt', 'apify>=1.0.0');
			await createPythonPackage('my_package');

			const result = await useCwdProject({ cwd: testDir });

			expect(result.isErr()).toBe(true);
			const error = result.unwrapErr();
			expect(error.message).toContain('Mixed project detected');
		});
	});
});
