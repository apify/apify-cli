import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CRAWLEE_PACKAGES } from './shared.js';

export class CrawleeAnalyzer {
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

				return CRAWLEE_PACKAGES.some((pkg) => packageJsonParsed?.dependencies?.[pkg] !== undefined);
			} catch {
				return false;
			}
		}

		if (hasRequirementsTxt) {
			const requirementsTxt = readFileSync(join(pathname, 'requirements.txt'), 'utf8');

			const lines = requirementsTxt.split('\n');

			return lines.some((line) => CRAWLEE_PACKAGES.some((pkg) => line.includes(pkg)));
		}

		return false;
	}
}
