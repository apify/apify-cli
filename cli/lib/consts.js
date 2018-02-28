const ACTS_TEMPLATES = {
    basic: {
        name: 'Basic act ("basic")',
        value: 'basic',
        dir: `${__dirname}/../templates/basic`,
    },
    puppeteer: {
        name: 'Puppeteer crawler ("puppeteer")',
        value: 'puppeteer',
        dir: `${__dirname}/../templates/puppeteer`,
    }
};

const ACTS_TEMPLATE_LIST = Object.keys(ACTS_TEMPLATES);

const DEFAULT_ACT_TEMPLATE = 'basic';

module.exports = { ACTS_TEMPLATES, ACTS_TEMPLATE_LIST, DEFAULT_ACT_TEMPLATE };
