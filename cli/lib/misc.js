const loadJSON = require('load-json-file');
const writeJSON = require('write-json-file');
const fs = require('fs');

const updateLocalJSON = async (path, updateAttrs = {}, nestedObjectAttr) => {
    const currentObject = await loadJSON(path);
    let newObject;

    if (nestedObjectAttr) {
        newObject = currentObject;
        newObject[nestedObjectAttr] = Object.assign({}, currentObject[nestedObjectAttr], updateAttrs);
    } else {
        newObject = Object.assign({}, currentObject, updateAttrs);
    }

    await writeJSON(path, newObject);
};

const createFolderSync = (folderPath) => {
    if (!fs.existsSync(folderPath)){
        fs.mkdirSync(folderPath);
    }
    return folderPath;
};

module.exports = { updateLocalJSON, createFolderSync };
