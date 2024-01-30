const { existsSync, readFileSync } = require('fs');
const { join } = require('path');

class CrawleeAnalyzer {
    static isApplicable(pathname) {
        const hasPackageJson = existsSync(join(pathname, 'package.json'));

        if (!hasPackageJson) {
            return false;
        }

        const packageJson = readFileSync(join(pathname, 'package.json'), 'utf8');

        try {
            const packageJsonParsed = JSON.parse(packageJson);

            return packageJsonParsed?.dependencies?.crawlee !== undefined;
        } catch (err) {
            return false;
        }
    }
}

exports.CrawleeAnalyzer = CrawleeAnalyzer;
