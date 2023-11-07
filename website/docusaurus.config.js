const { config } = require('@apify/docs-theme');
const { externalLinkProcessor } = require('./tools/utils/externalLink');

const { absoluteUrl } = config;
/** @type {Partial<import('@docusaurus/types').DocusaurusConfig>} */
module.exports = {
    title: 'CLI | Apify Documentation',
    url: absoluteUrl,
    baseUrl: '/cli',
    trailingSlash: false,
    organizationName: 'apify',
    projectName: 'apify-cli',
    favicon: 'img/favicon.svg',
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
                            to: 'docs',
                            label: 'Docs',
                            position: 'left',
                            activeBaseRegex: 'docs(?!/changelog|/reference)',
                        },
                        {
                            to: 'docs/reference',
                            label: 'Reference',
                            position: 'left',
                            activeBaseRegex: 'docs/reference',
                        },
                        {
                            to: 'docs/changelog',
                            label: 'Changelog',
                            position: 'left',
                            activeBaseRegex: 'docs/changelog',
                        },
                        {
                            href: 'https://github.com/apify/apify-cli',
                            label: 'GitHub',
                            position: 'left',
                        },
                        // {
                        //     type: 'docsVersionDropdown',
                        //     position: 'left',
                        //     className: 'navbar__item', // fixes margin around dropdown - hackish, should be fixed in theme
                        //     dropdownItemsBefore: [],
                        //     dropdownItemsAfter: [],
                        // },
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
    themeConfig: config.themeConfig,
    staticDirectories: ['node_modules/@apify/docs-theme/static', 'static'],
};
