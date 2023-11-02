const fs = require('fs');
const path = require('path');
const { walk } = require('@root/walk');
const handlebars = require('handlebars');
const inquirer = require('inquirer');
const ConfigParser = require('configparser');
const { ProjectAnalyzer } = require('./ProjectAnalyzer');

/**
 * Files that should be concatenated instead of copied (and overwritten).
 */
const concatenableFiles = ['.dockerignore', '.gitignore'];

async function merge(fromPath, toPath, options = { bindings: {} }) {
    await walk(fromPath, async (err, pathname, dirent) => {
        if (pathname === fromPath) return;
        const relPath = path.relative(fromPath, pathname);
        const toRelPath = relPath.split(path.sep).map((part) => {
            if (part.startsWith('{') && part.endsWith('}')) {
                part = part.replace('{', '').replace('}', '');
                const binding = options.bindings[part];
                if (!binding) {
                    throw new Error(`Binding for ${part} not found.`);
                }
                return binding;
            }
            return part;
        }).join(path.sep);

        const targetPath = path.join(toPath, toRelPath);

        if (dirent.isDirectory()) {
            if (!fs.existsSync(targetPath)) {
                fs.mkdirSync(targetPath);
            }
            return merge(pathname, targetPath);
        }

        if (relPath.includes('.template')) {
            fs.writeFileSync(
                path.join(
                    toPath,
                    toRelPath.replace('.template', ''),
                ),
                handlebars.compile(fs.readFileSync(pathname, 'utf8'))(options.bindings));
        } else if (fs.existsSync(targetPath) && concatenableFiles.includes(path.basename(toRelPath))) {
            fs.appendFileSync(targetPath, fs.readFileSync(pathname));
        } else {
            fs.copyFileSync(pathname, targetPath);
        }
    });
}

async function wrapScrapyProject({ p }) {
    if (!p) p = '.';

    const analyzer = new ProjectAnalyzer(p);

    if (analyzer.configuration.hasSection('apify')) {
        throw new Error(`The Scrapy project configuration already contains Apify settings. Are you sure you didn't already wrap this project?`);
    }

    await analyzer.init();

    const { spiderIndex } = await inquirer.prompt([
        {
            type: 'list',
            name: 'spiderIndex',
            message: 'Pick the Scrapy spider you want to wrap:',
            choices: analyzer.getAvailableSpiders().map((spider, i) => ({
                name: `${spider.class_name} (${spider.pathname})`,
                value: i,
            })),
        },
    ]);

    const templateBindings = {
        scrapy_settings_module: analyzer.configuration.get('settings', 'default'),
        apify_module_path: `${analyzer.settings.BOT_NAME}.apify`,
        spider_class_name: analyzer.getAvailableSpiders()[spiderIndex].class_name,
        spider_module_name: `..spiders.${analyzer.getAvailableSpiders()[spiderIndex].pathname.split(path.sep).slice(-1)[0].replace('.py', '')}`,
        projectFolder: analyzer.settings.BOT_NAME,
    };

    merge(
        `${__dirname}/../templates`,
        p,
        {
            bindings: templateBindings,
        },
    );

    const apifyConf = new ConfigParser();
    apifyConf.addSection('apify');
    apifyConf.set('apify', 'mainpy_location', analyzer.settings.BOT_NAME);

    const s = fs.createWriteStream(path.join(p, 'scrapy.cfg'), { flags: 'a' });

    await new Promise((r) => {
        s.on('open', (fd) => {
            s.write('\n', () => {
                apifyConf.write(fd);
                r();
            });
        });
    });
}

module.exports = { wrapScrapyProject };
