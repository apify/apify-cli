const { spawnSync } = require('child_process');
const path = require('path');
const { Spider } = require('./Spider');

class SpiderFileAnalyzer {
    constructor(pathname) {
        this.pathname = pathname;
    }

    getSpiders() {
        const pythonProcess = spawnSync('python', [
            path.join(__dirname, 'parseSpiderFile.py'),
            this.pathname,
        ]);
        const result = pythonProcess.stdout?.toString()?.trim();

        if (pythonProcess.status !== 0) {
            const e = new Error(`There was an error while parsing the spider file.

${pythonProcess.stderr?.toString()}`);

            throw e;
        }

        const spiders = [];

        for (const spider of JSON.parse(result)) {
            spiders.push(new Spider({ ...spider, pathname: this.pathname }));
        }

        return spiders;
    }
}

module.exports = { SpiderFileAnalyzer };
