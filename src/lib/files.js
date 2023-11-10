const fs = require('fs');
const path = require('path');

const loadJson = require('load-json-file');
const rimraf = require('rimraf');
const writeJson = require('write-json-file');

const updateLocalJson = async (jsonFilePath, updateAttrs = {}, nestedObjectAttr = null) => {
    const currentObject = await loadJson(jsonFilePath);
    let newObject;

    if (nestedObjectAttr) {
        newObject = currentObject;
        newObject[nestedObjectAttr] = { ...currentObject[nestedObjectAttr], ...updateAttrs };
    } else {
        newObject = { ...currentObject, ...updateAttrs };
    }

    await writeJson(jsonFilePath, newObject);
};

/**
 * If you pass /foo/bar as rootPath and /baz/raz as folderPath then it ensures that following folders exists:
 *
 * /foo/bar/baz
 * /foo/bar/baz/raz
 *
 * If you pass only one parameter then rootPath is considered to be '.'
 */
const ensureFolderExistsSync = (rootPath, folderPath) => {
    if (!folderPath) {
        folderPath = rootPath;
        rootPath = '.';
    }

    const parts = folderPath.split(path.sep);
    parts.reduce((currentPath, currentDir) => {
        currentPath = path.join(currentPath, currentDir);

        if (!fs.existsSync(currentPath)) fs.mkdirSync(currentPath);

        return currentPath;
    }, rootPath);
};

const rimrafPromised = (pathToBeRemoved) => {
    return new Promise((resolve, reject) => {
        rimraf(pathToBeRemoved, (err) => {
            if (err) reject(err);
            resolve();
        });
    });
};

const deleteFile = async (filePath) => {
    const stat = await fs.promises.stat(filePath);
    if (stat.isFile()) {
        await fs.promises.unlink(filePath);
    }
};

const sumFilesSizeInBytes = async (pathToFiles) => {
    const filesStats = await Promise.all(pathToFiles.map((filePath) => fs.promises.stat(filePath)));
    const filesSizeBytes = filesStats
        .map((stats) => stats.size)
        .reduce((sum, fileSize) => sum + fileSize, 0);
    return filesSizeBytes;
};

module.exports = {
    updateLocalJson,
    ensureFolderExistsSync,
    rimrafPromised,
    deleteFile,
    sumFilesSizeInBytes,
};
