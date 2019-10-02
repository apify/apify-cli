const { expect } = require('chai');
const path = require('path');
const command = require('@oclif/command');

describe('apify vis', () => {
    it('should correctly validate schema', async () => {
        await command.run(['vis', path.join(__dirname, 'input-schemas', 'valid.json')]);
    });

    it('should correctly validate schema', async () => {
        try {
            await command.run(['vis', path.join(__dirname, 'input-schemas', 'invalid.json')]);
            throw new Error('This should have failed!');
        } catch (err) {
            expect(err.message).to.contain('Field schema.properties.queries.editor should be equal to one of the allowed values');
        }
    });

    it('should correctly validate unparsable schema', async () => {
        try {
            await command.run(['vis', path.join(__dirname, 'input-schemas', 'unparsable.json')]);
            throw new Error('This should have failed!');
        } catch (err) {
            expect(err.message).to.contain('is not a valid JSON');
        }
    });
});
