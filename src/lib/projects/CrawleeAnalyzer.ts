import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CRAWLEE_PACKAGES } from './shared.js';

export class CrawleeAnalyzer {
	static isApplicable(pathname: string) {
		const hasPackageJson = existsSync(join(pathname, 'package.json'));

		if (!hasPackageJson) {
			return false;
		}

		const packageJson = readFileSync(join(pathname, 'package.json'), 'utf8');

		try {
			const packageJsonParsed = JSON.parse(packageJson);

			return CRAWLEE_PACKAGES.some((pkg) => packageJsonParsed?.dependencies?.[pkg] !== undefined);
		} catch {
			return false;
		}
	}
}
