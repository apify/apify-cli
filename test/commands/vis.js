const path = require('path');

const { expect, test } = require('@oclif/test');
// const command = require('@oclif/core');
// const { expect } = require('chai');
// const { ValidateInputSchemaCommand } = require('../../src/commands/vis');

describe('apify vis', () => {
    test.stdout()
        .command(['vis', path.join(__dirname, 'input-schemas', 'valid.json')])
        .it('should correctly validate schema 1', (ctx) => {
            expect(ctx.stdout).to.contain('hello friend from oclif!');
        });

    // it('should correctly validate schema 2', async () => {
    //     try {
    //         await command.run(['vis', path.join(__dirname, 'input-schemas', 'invalid.json')]);
    //         throw new Error('This should have failed!');
    //     } catch (err) {
    //         console.log(err.message);
    //         expect(err.message).to.contain('Field schema.properties.queries.editor must be equal to one of the allowed values');
    //     }
    // });
    //
    // it('should correctly validate unparsable schema', async () => {
    //     try {
    //         await command.run(['vis', path.join(__dirname, 'input-schemas', 'unparsable.json')]);
    //         throw new Error('This should have failed!');
    //     } catch (err) {
    //         expect(err.message).to.contain.oneOf(['Unexpected token "}', 'Expected \',\' or \']\' after array element']);
    //     }
    // });
});
