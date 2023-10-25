const fs = require('fs');
const path = require('path');
const { walk } = require('@root/walk');
const handlebars = require('handlebars');
const { ProjectAnalyzer } = require('./ProjectAnalyzer');

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

        if (dirent.isDirectory()) {
            if (!fs.existsSync(path.join(toPath, toRelPath))) {
                fs.mkdirSync(path.join(toPath, toRelPath));
            }
            return merge(pathname, path.join(toPath, toRelPath));
        }

        if (relPath.includes('.template.py')) {
            fs.writeFileSync(
                path.join(
                    toPath,
                    toRelPath.replace('.template.py', '.py'),
                ),
                handlebars.compile(fs.readFileSync(pathname, 'utf8'))(options.bindings));
        } else {
            fs.copyFileSync(pathname, path.join(toPath, toRelPath));
        }
    });
}

async function wrapScrapyProject({ p }) {
    if (!p) p = '.';

    const project = new ProjectAnalyzer(p);
    await project.init();

    const templateBindings = {
        scrapy_settings_module: project.configuration.get('settings', 'default'),
        apify_module_path: `${project.settings.BOT_NAME}.apify`,
        spider_class_name: project.getAvailableSpiders()[0].class_name,
        spider_module_name: `..spiders.${project.getAvailableSpiders()[0].pathname.split(path.sep).slice(-1)[0].replace('.py', '')}`,
        projectFolder: project.settings.BOT_NAME,
    };

    merge(
        `${__dirname}/../templates`,
        p,
        {
            bindings: templateBindings,
        },
    );
}

module.exports = { wrapScrapyProject };
