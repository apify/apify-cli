const Mixpanel = require('mixpanel');
const loadJson = require('load-json-file');
const writeJson = require('write-json-file');
const { cryptoRandomObjectId } = require('@apify/utilities');
const { MIXPANEL_TOKEN, TELEMETRY_FILE_PATH } = require('./consts');
const { detectInstallationType } = require('./version_check');

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

const isTelemetryEnabled = !process.env.APIFY_CLI_DISABLE_TELEMETRY
    || ['false', '0'].includes(process.env.APIFY_CLI_DISABLE_TELEMETRY);

/**
 * Tracks telemetry event if telemetry is enabled.
 *
 * @param eventName
 * @param eventData
 * @param distinctId
 */
const maybeTrackTelemetry = ({ eventName, eventData, distinctId }) => {
    try {
        if (isTelemetryEnabled) {
            if (!distinctId) distinctId = getOrCreateLocalDistinctId();
            // NOTE: We don't use callback here, because we don't want to wait for Mixpanel to finish.
            mixpanel.track(eventName, {
                distinct_id: distinctId,
                $os: process.platform,
                metadata: {
                    installationType: detectInstallationType(),
                },
                ...eventData,
            }, () => { /* Ignore errors */ });
        }
    } catch (e) {
        // Ignore errors
    }
};

module.exports = {
    mixpanel,
    getOrCreateLocalDistinctId,
    isTelemetryEnabled,
    maybeTrackTelemetry,
};
