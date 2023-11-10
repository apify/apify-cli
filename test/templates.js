const actorTemplates = require('@apify/actor-templates');
const { expect } = require('chai');

describe('templates', () => {
    it('can be fetched', async () => {
        const { templates } = await actorTemplates.fetchManifest();
        expect(Array.isArray(templates)).to.be.eql(true);
        expect(templates.length).to.be.greaterThan(0);
    });
});
