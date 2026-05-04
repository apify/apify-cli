const visit = import('unist-util-visit').then((m) => m.visit);

const internalUrls = ['sdk.apify.com'];

const PLACEHOLDER_BASE = 'http://apify.cli';

/**
 * @param {string} href
 */
function isInternal(href) {
    const url = new URL(href, PLACEHOLDER_BASE);

    if (url.origin === PLACEHOLDER_BASE) {
        // Relative URL (no protocol/host) — internal if it has content
        return href.length > 0;
    }

    return internalUrls.some((internalUrl) => url.host === internalUrl);
}

/**
 * @type {import('unified').Plugin}
 */
exports.externalLinkProcessor = () => {
    return async (tree) => {
        (await visit)(tree, 'element', (node) => {
            if (
                node.tagName === 'a'
                && node.properties
                && typeof node.properties.href === 'string'
            ) {
                if (!isInternal(node.properties.href)) {
                    node.properties.target = '_blank';
                    node.properties.rel = 'noopener';
                } else {
                    node.properties.target = null;
                    node.properties.rel = null;
                }
            }
        });
    };
};
