const { config } = require('@apify/docs-theme');

const { externalLinkProcessor } = require('./tools/utils/externalLink');
const versions = require('./versions.json');

const { absoluteUrl } = config;
/** @type {Partial<import('@docusaurus/types').DocusaurusConfig>} */
module.exports = {
    future: {
        experimental_faster: {
            swcJsLoader: true,
            swcJsMinimizer: true,
            swcHtmlMinimizer: true,
            lightningCssMinimizer: true,
            rspackBundler: true,
            mdxCrossCompilerCache: true,
            rspackPersistentCache: true,
        },
        v4: {
            removeLegacyPostBuildHeadAttribute: true,
            useCssCascadeLayers: false,
        },
    },
    title: 'CLI | Apify Documentation',
    url: absoluteUrl,
    baseUrl: '/cli',
    trailingSlash: false,
    organizationName: 'apify',
    projectName: 'apify-cli',
    favicon: 'img/favicon.svg',
    scripts: [...(config.scripts ?? [])],
    onBrokenLinks:
    /** @type {import('@docusaurus/types').ReportingSeverity} */ ('throw'),
    onBrokenMarkdownLinks:
    /** @type {import('@docusaurus/types').ReportingSeverity} */ ('throw'),
    themes: [
        [
            '@apify/docs-theme',
            {
                subNavbar: {
                    title: 'Apify CLI',
                    items: [
                        {
                            type: 'doc',
                            docId: 'index',
                            label: 'Docs',
                            position: 'left',
                            activeBaseRegex: 'docs(?!/changelog|/reference)',
                        },
                        {
                            type: 'doc',
                            docId: 'reference',
                            label: 'Reference',
                            position: 'left',
                            activeBaseRegex: 'reference',
                        },
                        {
                            type: 'doc',
                            docId: 'changelog',
                            label: 'Changelog',
                            position: 'left',
                            activeBaseRegex: 'changelog',
                        },
                        {
                            href: 'https://github.com/apify/apify-cli',
                            label: 'GitHub',
                            position: 'left',
                        },
                        {
                            type: 'docsVersionDropdown',
                            position: 'left',
                            className: 'navbar__item', // fixes margin around dropdown - hackish, should be fixed in theme
                            dropdownItemsBefore: [],
                            dropdownItemsAfter: [],
                        },
                    ],
                },
            },
        ],
    ],
    presets: /** @type {import('@docusaurus/types').PresetConfig[]} */ ([
        [
            '@docusaurus/preset-classic',
            /** @type {import('@docusaurus/preset-classic').Options} */
            ({
                docs: {
                    // Docusaurus shows the author and date of last commit to entire repo, which doesn't make sense,
                    // so let's just disable showing author and last modification
                    showLastUpdateAuthor: false,
                    showLastUpdateTime: false,
                    path: '../docs',
                    sidebarPath: './sidebars.js',
                    rehypePlugins: [externalLinkProcessor],
                    editUrl: 'https://github.com/apify/apify-cli/edit/master/website/',
                },
            }),
        ],
    ]),
    plugins: [
        ...config.plugins,
    ],
    themeConfig: { ...config.themeConfig, versions },
    staticDirectories: ['node_modules/@apify/docs-theme/static', 'static'],
    customFields: {
        ...(config.customFields ?? []),
    },
};
