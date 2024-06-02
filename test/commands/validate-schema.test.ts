import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCommand } from '@oclif/test';

const basePath = join(fileURLToPath(import.meta.url), '../../__setup__/input-schemas/');

describe('apify validate-schema', () => {
	it('should correctly validate schema 1', async () => {
		const { error } = await runCommand(['validate-schema', join(basePath, 'valid.json')], import.meta.url);

		expect(error).toBeFalsy();
	});

	it('should correctly validate schema 2', async () => {
		const { error } = await runCommand(['validate-schema', join(basePath, 'invalid.json')], import.meta.url);

		expect(error).toBeTruthy();
		expect(error?.message).to.contain(
			'Field schema.properties.queries.editor must be equal to one of the allowed values',
		);
	});

	it('should correctly validate schema 3', async () => {
		const { error } = await runCommand(['validate-schema', join(basePath, 'unparsable.json')], import.meta.url);

		expect(error).toBeTruthy();
		expect(error?.message).to.contain.oneOf(['Unexpected token }', "Expected ',' or ']' after array element"]);
	});

	it('should correctly validate schema 1 with alias', async () => {
		const { error } = await runCommand(['vis', join(basePath, 'valid.json')], import.meta.url);

		expect(error).toBeFalsy();
	});
});
