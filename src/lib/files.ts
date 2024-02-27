import { existsSync, mkdirSync } from 'node:fs';
import { stat, unlink } from 'node:fs/promises';
import { join, sep } from 'node:path';

import { loadJsonFile } from 'load-json-file';
import { rimraf } from 'rimraf';
import { writeJsonFile } from 'write-json-file';

export const updateLocalJson = async (jsonFilePath: string, updateAttrs: Record<string, unknown> = {}, nestedObjectAttr = null) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currentObject = await loadJsonFile(jsonFilePath) as Record<string, any>;
    let newObject: Record<string, unknown>;

    if (nestedObjectAttr) {
        newObject = currentObject;
        newObject[nestedObjectAttr] = { ...currentObject[nestedObjectAttr], ...updateAttrs };
    } else {
        newObject = { ...currentObject, ...updateAttrs };
    }

    await writeJsonFile(jsonFilePath, newObject);
};

/**
 * If you pass /foo/bar as rootPath and /baz/raz as folderPath then it ensures that following folders exists:
 *
 * /foo/bar/baz
 * /foo/bar/baz/raz
 *
 * If you pass only one parameter then rootPath is considered to be '.'
 */
export const ensureFolderExistsSync = (rootPath: string, folderPath?: string) => {
    if (!folderPath) {
        folderPath = rootPath;
        rootPath = '.';
    }

    const parts = folderPath.split(sep);
    parts.reduce((currentPath, currentDir) => {
        currentPath = join(currentPath, currentDir);

        if (!existsSync(currentPath)) {
            mkdirSync(currentPath);
        }

        return currentPath;
    }, rootPath);
};

export const rimrafPromised = async (pathToBeRemoved: string | string[]) => {
    await rimraf(pathToBeRemoved);
};

export const deleteFile = async (filePath: string) => {
    const res = await stat(filePath);
    if (res.isFile()) {
        await unlink(filePath);
    }
};

export const sumFilesSizeInBytes = async (pathToFiles: string[], cwd: string) => {
    const filesStats = await Promise.all(pathToFiles.map(async (filePath) => stat(join(cwd, filePath))));

    const filesSizeBytes = filesStats
        .map((stats) => stats.size)
        .reduce((sum, fileSize) => sum + fileSize, 0);

    return filesSizeBytes;
};
