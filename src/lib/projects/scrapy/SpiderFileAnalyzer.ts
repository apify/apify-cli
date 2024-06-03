import { readFileSync } from 'node:fs';

import { Spider } from './Spider.js';

export class SpiderFileAnalyzer {
	pathname: string;

	constructor(pathname: string) {
		this.pathname = pathname;
	}

	getSpiders() {
		const file = readFileSync(this.pathname, 'utf8');

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
