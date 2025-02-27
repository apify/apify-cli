import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { lt } from 'semver';

import { CRAWLEE_PACKAGES, VERSION_WHEN_APIFY_MOVED_TO_CRAWLEE_JS } from './shared.js';

export class PreCrawleeApifySDKAnalyzer {
	static isApplicable(pathname: string) {
		const hasPackageJson = existsSync(join(pathname, 'package.json'));

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

				return lt(actualVersion, VERSION_WHEN_APIFY_MOVED_TO_CRAWLEE_JS);
			} catch {
				return false;
			}
		}

		// We don't check python because python SDK always comes with crawlee

		return false;
	}
}
