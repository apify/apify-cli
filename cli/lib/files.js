const loadJson = require('load-json-file');
const writeJson = require('write-json-file');
const fs = require('fs');
const rimraf = require('rimraf');

const updateLocalJson = async (path, updateAttrs = {}, nestedObjectAttr) => {
    const currentObject = await loadJson(path);
    let newObject;

    if (nestedObjectAttr) {
        newObject = currentObject;
        newObject[nestedObjectAttr] = Object.assign({}, currentObject[nestedObjectAttr], updateAttrs);
    } else {
        newObject = Object.assign({}, currentObject, updateAttrs);
    }

    await writeJson(path, newObject);
};

const createFolderSync = (folderPath) => {
    if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath);

    return folderPath;
};

const rimrafPromised = (path) => {
    return new Promise((resolve, revoke) => {
        rimraf(path, (err) => {
            if (err) revoke(err);
            resolve();
        });
    });
};

module.exports = { updateLocalJson, createFolderSync, rimrafPromised };
