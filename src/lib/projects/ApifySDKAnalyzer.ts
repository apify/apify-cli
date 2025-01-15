import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { lt } from 'semver';

import { CRAWLEE_PACKAGES } from './shared.js';

const VERSION_WHEN_APIFY_MOVED_TO_CRAWLEE = '3.0.0';

export class ApifySDKAnalyzer {
	static isApplicable(pathname: string) {
		const hasPackageJson = existsSync(join(pathname, 'package.json'));
		const hasRequirementsTxt = existsSync(join(pathname, 'requirements.txt'));

		if (!hasPackageJson && !hasRequirementsTxt) {
			return false;
		}

		if (hasPackageJson) {
			const packageJson = readFileSync(join(pathname, 'package.json'), 'utf8');

			try {
				const packageJsonParsed = JSON.parse(packageJson);

				// If they have crawlee as a dependency, likely to use crawlee
				if (CRAWLEE_PACKAGES.some((pkg) => packageJsonParsed?.dependencies?.[pkg] !== undefined)) {
					return false;
				}

				const apifyVersion = packageJsonParsed?.dependencies?.apify;
				if (!apifyVersion) {
					return false;
				}

				// We cannot infer/crawlee v3
				if (apifyVersion === '*') {
					return false;
				}

				let actualVersion = apifyVersion;

				if (apifyVersion.startsWith('~') || apifyVersion.startsWith('^')) {
					actualVersion = apifyVersion.slice(1);
				}

				return lt(actualVersion, VERSION_WHEN_APIFY_MOVED_TO_CRAWLEE);
			} catch {
				return false;
			}
		}

		if (hasRequirementsTxt) {
			const requirementsTxt = readFileSync(join(pathname, 'requirements.txt'), 'utf8');

			const lines = requirementsTxt.split('\n');

			return (
				// No crawlee present
				lines.some((line) => !CRAWLEE_PACKAGES.some((pkg) => line.includes(pkg))) &&
				// but has SDK
				lines.some((line) => line.includes('apify'))
			);
		}

		return false;
	}
}
