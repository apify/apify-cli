const loadJson = require('load-json-file');
const writeJson = require('write-json-file');
const {
    STATE_FILE_PATH,
} = require('./consts');

/**
 * Returns state object from auth file or empty object.
 * This method is synchronous/blocking to avoid different race conditions.
 *
 * @return {Object}
 */
const getLocalState = () => {
    try {
        return loadJson.sync(STATE_FILE_PATH) || {};
    } catch (e) {
        return {};
    }
};

/**
 * Extends local state by given values.
 * This method is synchronous/blocking to avoid different race conditions.
 *
 * @param {Object} data
 */
const extendLocalState = (data) => {
    const state = getLocalState();
    writeJson.sync(STATE_FILE_PATH, {
        ...state,
        ...data,
    });
};

module.exports = {
    getLocalState,
    extendLocalState,
};
