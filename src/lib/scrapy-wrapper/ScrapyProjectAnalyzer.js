const { readdirSync } = require('fs');
const fs = require('fs');
const path = require('path');

const ConfigParser = require('configparser');
const inquirer = require('inquirer');

const { SpiderFileAnalyzer } = require('./SpiderFileAnalyzer');

class ScrapyProjectAnalyzer {
    constructor(pathname) {
        this.pathname = pathname;
        this.configuration = null;
        this.settings = null;
        this.loadScrapyCfg();
    }

    static isApplicable(pathname) {
        return fs.existsSync(path.join(pathname, 'scrapy.cfg'));
    }

    async init() {
        await this.loadSettings();
    }

    loadScrapyCfg() {
        const config = new ConfigParser();
        const scrapyCfgPath = path.resolve(path.join(this.pathname, 'scrapy.cfg'));

        if (!fs.existsSync(scrapyCfgPath)) {
            throw new Error(`scrapy.cfg not found in "${scrapyCfgPath}". 
Are you sure there is a Scrapy project there?`);
        }

        config.read(scrapyCfgPath);
        this.configuration = config;
    }

    async loadSettings() {
        const assumedBotName = this.configuration.get('settings', 'default').split('.')[0];

        const settings = await inquirer.prompt([
            {
                type: 'input',
                name: 'BOT_NAME',
                message: 'Enter the Scrapy BOT_NAME (see settings.py):',
                default: assumedBotName,
            },
            {
                type: 'input',
                name: 'SPIDER_MODULES',
                message: 'What folder are the Scrapy spider modules stored in? (see SPIDER_MODULES in settings.py):',
                default: [`${assumedBotName}.spiders`],
            },
        ]);

        if (typeof settings.SPIDER_MODULES === 'string') settings.SPIDER_MODULES = [settings.SPIDER_MODULES];

        this.settings = settings;
    }

    getName() {
        return this.settings?.BOT_NAME;
    }

    getAvailableSpiders() {
        const spiderPaths = this.settings?.SPIDER_MODULES;

        if (!spiderPaths) {
            throw new Error('SPIDER_MODULES path not found in settings.');
        }

        const spiders = [];

        for (const spiderPath of spiderPaths) {
            const spidersDir = path.join(this.pathname, spiderPath.replaceAll('.', '/'));

            const files = readdirSync(spidersDir, { withFileTypes: true });
            for (const file of files) {
                if (file.isFile() && file.name.endsWith('.py') && file.name !== '__init__.py') {
                    spiders.push(...(new SpiderFileAnalyzer(path.join(spidersDir, file.name)).getSpiders()));
                }
            }
        }

        return spiders;
    }
}

module.exports = { ScrapyProjectAnalyzer };
