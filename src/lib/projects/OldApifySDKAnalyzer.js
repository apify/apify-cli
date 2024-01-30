const { existsSync, readFileSync } = require('fs');
const { join } = require('path');

const { lt } = require('semver');

const VERSION_WHEN_APIFY_MOVED_TO_CRAWLEE = '3.0.0';

class OldApifySDKAnalyzer {
    static isApplicable(pathname) {
        const hasPackageJson = existsSync(join(pathname, 'package.json'));

        if (!hasPackageJson) {
            return false;
        }

        const packageJson = readFileSync(join(pathname, 'package.json'), 'utf8');

        try {
            const packageJsonParsed = JSON.parse(packageJson);

            // If they have crawlee as a dependency, likely to use crawlee
            if (packageJsonParsed?.dependencies?.crawlee !== undefined) {
                return false;
            }

            const apifyVersion = packageJsonParsed?.dependencies?.apify;
            if (!apifyVersion) {
                return false;
            }

            // We cannot infer
            if (apifyVersion === '*') {
                return false;
            }

            let actualVersion = apifyVersion;

            if (apifyVersion.startsWith('~') || apifyVersion.startsWith('^')) {
                actualVersion = apifyVersion.slice(1);
            }

            return lt(actualVersion, VERSION_WHEN_APIFY_MOVED_TO_CRAWLEE);
        } catch (err) {
            return false;
        }
    }
}

exports.OldApifySDKAnalyzer = OldApifySDKAnalyzer;
