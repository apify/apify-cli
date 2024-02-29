import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from '@oclif/test';

const basePath = join(fileURLToPath(import.meta.url), '../../__setup__/input-schemas/');

describe('apify vis', () => {
    test
        .command(['vis', join(basePath, 'valid.json')])
        .it('should correctly validate schema 1');

    test
        .command(['vis', join(basePath, 'invalid.json')])
        .catch((error) => {
            expect(error.message).to.contain('Field schema.properties.queries.editor must be equal to one of the allowed values');
        })
        .it('should correctly validate schema 2');

    test
        .command(['vis', join(basePath, 'unparsable.json')])
        .catch((error) => {
            expect(error.message).to.contain.oneOf(['Unexpected token }', "Expected ',' or ']' after array element"]);
        })
        .it('should correctly validate schema 3');
});
