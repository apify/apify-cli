const loadJSON = require('load-json-file');
const writeJSON = require('write-json-file');

const updateLocalJSON = async (path, updateAtts = {}) => {
    const data = await loadJSON(path);
    Object.assign(data, updateAtts);
    await writeJSON(path, data);
};

module.exports = { updateLocalJSON };
