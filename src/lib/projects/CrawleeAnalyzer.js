const { existsSync, readFileSync } = require('fs');
const { join } = require('path');

const CRAWLEE_PACKAGES = [
    'crawlee',
    '@crawlee/core',
    '@crawlee/puppeteer',
    '@crawlee/playwright',
    '@crawlee/cheerio',
    '@crawlee/jsdom',
    '@crawlee/linkedom',
    '@crawlee/http',
    '@crawlee/browser',
    '@crawlee/basic',
];

class CrawleeAnalyzer {
    static isApplicable(pathname) {
        const hasPackageJson = existsSync(join(pathname, 'package.json'));

        if (!hasPackageJson) {
            return false;
        }

        const packageJson = readFileSync(join(pathname, 'package.json'), 'utf8');

        try {
            const packageJsonParsed = JSON.parse(packageJson);

            return CRAWLEE_PACKAGES.some((pkg) => packageJsonParsed?.dependencies?.[pkg] !== undefined);
        } catch (err) {
            return false;
        }
    }
}

exports.CrawleeAnalyzer = CrawleeAnalyzer;
