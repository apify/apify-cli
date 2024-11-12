import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import ConfigParser from 'configparser';
import inquirer from 'inquirer';

import { SpiderFileAnalyzer } from './SpiderFileAnalyzer.js';

export class ScrapyProjectAnalyzer {
	pathname: string;
	configuration: ConfigParser = null!;
	settings: { BOT_NAME: string; SPIDER_MODULES: string[] } | null = null;

	constructor(pathname: string) {
		this.pathname = pathname;
		this.settings = null;
		this.loadScrapyCfg();
	}

	static isApplicable(pathname: string) {
		return existsSync(join(pathname, 'scrapy.cfg'));
	}

	async init() {
		await this.loadSettings();
	}

	loadScrapyCfg() {
		const config = new ConfigParser();
		const scrapyCfgPath = resolve(join(this.pathname, 'scrapy.cfg'));

		if (!existsSync(scrapyCfgPath)) {
			throw new Error(`scrapy.cfg not found in "${scrapyCfgPath}".
Are you sure there is a Scrapy project there?`);
		}

		config.read(scrapyCfgPath);
		this.configuration = config;
	}

	async loadSettings() {
		const assumedBotName = this.configuration.get('settings', 'default')!.split('.')[0];

		const settings = await inquirer.prompt<{ BOT_NAME: string; SPIDER_MODULES: string }>([
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
				default: `${assumedBotName}.spiders`,
			},
		]);

		this.settings = {
			BOT_NAME: settings.BOT_NAME,
			SPIDER_MODULES:
				typeof settings.SPIDER_MODULES === 'string' ? [settings.SPIDER_MODULES] : settings.SPIDER_MODULES,
		};
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
			const spidersDir = join(this.pathname, spiderPath.replaceAll('.', '/'));

			const files = readdirSync(spidersDir, { withFileTypes: true });
			for (const file of files) {
				if (file.isFile() && file.name.endsWith('.py') && file.name !== '__init__.py') {
					spiders.push(...new SpiderFileAnalyzer(join(spidersDir, file.name)).getSpiders());
				}
			}
		}

		return spiders;
	}
}
