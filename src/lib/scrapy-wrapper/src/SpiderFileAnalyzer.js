const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { Spider } = require('./Spider');

class SpiderFileAnalyzer {
    constructor(pathname) {
        this.pathname = pathname;
    }

    getSpiders() {
        const file = fs.readFileSync(this.pathname, 'utf8');

        const regex = /class\s+(\w+)/g;
        let match;
        const spiders = [];

        while ((match = regex.exec(file)) !== null) {
            spiders.push(new Spider({ class_name: match[1], pathname: this.pathname }));
        }

        return spiders;
    }
}

module.exports = { SpiderFileAnalyzer };
