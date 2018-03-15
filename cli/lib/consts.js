module.exports.ACTS_TEMPLATES = {
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

module.exports.ACTS_TEMPLATE_LIST = Object.keys(module.exports.ACTS_TEMPLATES);

module.exports.DEFAULT_ACT_TEMPLATE = 'basic';

module.exports.APIFY_LOCAL_EMULATION_DIR = 'apify_local';

module.exports.APIFY_DEFAULT_KEY_VALUE_STORE_ID = 'default';

module.exports.APIFY_DEFAULT_DATASET_ID = 'default';
