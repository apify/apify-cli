const fs = require('fs');

const { Spider } = require('./Spider');

class SpiderFileAnalyzer {
    constructor(pathname) {
        this.pathname = pathname;
    }

    getSpiders() {
        const file = fs.readFileSync(this.pathname, 'utf8');

        const regex = /class\s+(\w+)/g;
        const spiders = [];

        let match = regex.exec(file);
        while (match) {
            spiders.push(new Spider({ class_name: match[1], pathname: this.pathname }));
            match = regex.exec(file);
        }

        return spiders;
    }
}

module.exports = { SpiderFileAnalyzer };
