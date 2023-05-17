const Mixpanel = require('mixpanel');
const loadJson = require('load-json-file');
const writeJson = require('write-json-file');
const { cryptoRandomObjectId } = require('@apify/utilities');
const { MIXPANEL_TOKEN, TELEMETRY_FILE_PATH } = require('./consts');

const mixpanel = Mixpanel.init(MIXPANEL_TOKEN, { keepAlive: false });

/**
 * Returns telemetry distinctId for current local environment or creates new one.
 * @returns {Promise<*|string>}
 */
const getOrCreateLocalDistinctId = () => {
    try {
        const telemetry = loadJson.sync(TELEMETRY_FILE_PATH);
        return telemetry.distinctId;
    } catch (e) {
        const distinctId = cryptoRandomObjectId();
        writeJson.sync(TELEMETRY_FILE_PATH, { distinctId });
        return distinctId;
    }
};

const isTelemetryEnabled = !['true', '1'].includes(process.env.APIFY_CLI_TELEMETRY_DISABLE);

module.exports = {
    mixpanel,
    getOrCreateLocalDistinctId,
    isTelemetryEnabled,
};
