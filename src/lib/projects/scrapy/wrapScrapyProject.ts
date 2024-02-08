import { appendFileSync, copyFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';

import { fetchManifest, wrapperManifestUrl } from '@apify/actor-templates';
import rootWalk from '@root/walk';
import ConfigParser from 'configparser';
import Handlebars from 'handlebars';
import inquirer from 'inquirer';

import { ScrapyProjectAnalyzer } from './ScrapyProjectAnalyzer.js';
import { info, success } from '../../outputs.js';
import { downloadAndUnzip, sanitizeActorName } from '../../utils.js';

/**
 * Files that should be concatenated instead of copied (and overwritten).
 */
const concatenableFiles = ['.dockerignore', '.gitignore'];

async function merge(fromPath: string, toPath: string, options: { bindings: Record<string, string>; } = { bindings: {} }) {
    await rootWalk.walk(fromPath, async (_err, pathname, dirent) => {
        if (pathname === fromPath) return;
        const relPath = relative(fromPath, pathname);
        const toRelPath = relPath.split(sep).map((part) => {
            if (part.startsWith('{') && part.endsWith('}')) {
                part = part.replace('{', '').replace('}', '');
                const binding = options.bindings[part];
                if (!binding) {
                    throw new Error(`Binding for ${part} not found.`);
                }
                return binding;
            }
            return part;
        }).join(sep);

        const targetPath = join(toPath, toRelPath);

        if (dirent.isDirectory()) {
            if (!existsSync(targetPath)) {
                mkdirSync(targetPath);
            }

            return merge(pathname, targetPath);
        }

        if (relPath.includes('.template')) {
            writeFileSync(
                join(
                    toPath,
                    toRelPath.replace('.template', ''),
                ),
                Handlebars.compile(readFileSync(pathname, 'utf8'))(options.bindings));
        } else if (existsSync(targetPath) && concatenableFiles.includes(basename(toRelPath))) {
            appendFileSync(targetPath, readFileSync(pathname));
        } else {
            copyFileSync(pathname, targetPath);
        }
    });
}

export async function wrapScrapyProject({ projectPath }: { projectPath?: string; }) {
    if (!projectPath) {
        projectPath = '.';
    }

    const analyzer = new ScrapyProjectAnalyzer(projectPath);

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

    function translatePathToRelativeModuleName(pathname: string) {
        const relPath = relative(projectPath!, pathname);

        return `.${relPath.split(sep).slice(1).join('.').replace('.py', '')}`;
    }

    const templateBindings = {
        botName: sanitizeActorName(analyzer.settings!.BOT_NAME),
        scrapy_settings_module: analyzer.configuration.get('settings', 'default')!,
        apify_module_path: `${analyzer.settings!.BOT_NAME}.apify`,
        spider_class_name: analyzer.getAvailableSpiders()[spiderIndex].class_name,
        spider_module_name: `${translatePathToRelativeModuleName(analyzer.getAvailableSpiders()[spiderIndex].pathname)}`,
        projectFolder: analyzer.settings!.BOT_NAME,
    };

    const manifest = await fetchManifest(wrapperManifestUrl);

    info('Downloading the latest Scrapy wrapper template...');

    const { archiveUrl } = manifest.templates.find(({ id }) => id === 'python-scrapy')!;
    const templatePath = join(__dirname, 'templates', 'python-scrapy');

    if (existsSync(templatePath)) rmSync(templatePath, { recursive: true });

    await downloadAndUnzip({
        url: archiveUrl,
        pathTo: templatePath,
    });

    info('Wrapping the Scrapy project...');

    await merge(
        join(__dirname, 'templates', 'python-scrapy'),
        projectPath,
        {
            bindings: templateBindings,
        },
    );

    const apifyConf = new ConfigParser();
    apifyConf.addSection('apify');
    apifyConf.set('apify', 'mainpy_location', analyzer.settings!.BOT_NAME);

    const s = createWriteStream(join(projectPath, 'scrapy.cfg'), { flags: 'a' });

    await new Promise<void>((r) => {
        s.on('open', (fd) => {
            s.write('\n', () => {
                apifyConf.write(fd);
                r();
            });
        });
    });

    success('The Scrapy project has been wrapped successfully.');
}
