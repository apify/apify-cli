import { fetchManifest } from '@apify/actor-templates';

describe('templates', () => {
    it('can be fetched', async () => {
        const { templates } = await fetchManifest();
        expect(Array.isArray(templates)).toBeTruthy();
        expect(templates.length).toBeGreaterThan(0);
    });
});
