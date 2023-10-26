const ConfigParser = require('configparser');
const { readdirSync } = require('fs');
const path = require('path');
const fs = require('fs');

const { SpiderFileAnalyzer } = require('./SpiderFileAnalyzer');
const inquirer = require('inquirer');
const { warning } = require('../../outputs');

/**
 * A simple example of analyzing the scrapy project.
 */
class ProjectAnalyzer {
    configuration = null;
    settings = null;

    constructor(pathname) {
        this.pathname = pathname;
    }

    async init() {
        this.loadScrapyCfg();
        await this.loadSettings();
    }

    static isScrapyProject(pathname) {
        return fs.existsSync(path.join(pathname, 'scrapy.cfg'));
    }

    loadScrapyCfg() {
        const config = new ConfigParser();
        const scrapyCfgPath = path.resolve(path.join(this.pathname, 'scrapy.cfg'));

        if(!fs.existsSync(scrapyCfgPath)) throw new Error(`scrapy.cfg not found in "${scrapyCfgPath}". 
Are you sure there is a Scrapy project there?`);

        config.read(scrapyCfgPath);
        this.configuration = config;

        if(this.configuration.hasSection('apify')) {
            throw new Error(`The Scrapy project configuration already contains Apify settings. Are you sure you didn't already wrap this project?`);
        }
    }

    async loadSettings(){
        const assumedBotName = this.configuration.get('settings', 'default').split('.')[0];

        const settings = await inquirer.prompt([
            {
                type: 'input',
                name: 'BOT_NAME',
                message: 'Enter the Scrapy BOT_NAME (see settings.py):',
                default: assumedBotName
            },
            {
                type: 'input',
                name: 'SPIDER_MODULES',
                message: 'What folder are the Scrapy spider modules stored in? (see SPIDER_MODULES in settings.py):',
                default: [`${assumedBotName}.spiders`]
            },
        ]);

        const apifyConf = new ConfigParser();
        apifyConf.addSection('apify');
        apifyConf.set('apify', 'mainpy_location', settings.BOT_NAME);

        const s = fs.createWriteStream(path.join(this.pathname, 'scrapy.cfg'), { flags: 'a' });

        await new Promise(r => {
            s.on('open', (fd) => {
                s.write('\n', () => {
                    apifyConf.write(fd);
                    r();
                });
            })
        })

        if(typeof settings.SPIDER_MODULES == 'string') settings.SPIDER_MODULES = [settings.SPIDER_MODULES];

        this.settings = settings;

    // Automagic settings loading is not supported yet.
    //     {
    //         const pythonProcess = spawnSync('python', [
    //             path.join(__dirname, 'parseSettings.py'),
    //             path.join(this.pathname, `${this.configuration.get('settings', 'default').replace('.', '/')}.py`),
    //         ]);
    //         const result = pythonProcess.stdout?.toString()?.trim();
    
    //         if(pythonProcess.status !== 0) {
    //             const e = new Error(`There was an error while parsing the settings file.
    
    // ${pythonProcess.stderr?.toString()}`);
    
    //             throw e;
    //         }
    
    //         this.settings = JSON.parse(result);
    //     }
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
            const files = readdirSync(path.join(this.pathname, spiderPath.replace('.', '/')), { withFileTypes: true });
            for (const file of files) {
                if(file.isFile() && file.name.endsWith('.py') && file.name !== '__init__.py') 
                    spiders.push(...(new SpiderFileAnalyzer(path.join(this.pathname, spiderPath.replace('.', '/'), file.name)).getSpiders()));
            }
        }

        return spiders;
    }
}

module.exports = { ProjectAnalyzer };