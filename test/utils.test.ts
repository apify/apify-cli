import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { execWithLog } from '../src/lib/exec.js';
import { ensureFolderExistsSync, rimrafPromised } from '../src/lib/files.js';
import { argsToCamelCase, createActZip, getActorLocalFilePaths } from '../src/lib/utils.js';

const TEST_DIR = 'my-test-dir';
const FOLDERS = ['my_test', 'my_test/test_in_test', 'my_next_test', '.dot_test'];
const FOLDERS_TO_IGNORE = ['test_to_ignore', 'my_test/this_ignore'];
const FILES = ['main.js', 'my_module.js', 'next_module.js',
    'my_test/test.js', 'my_test/test_in_test/test.js', 'my_next_test/test.js',
    '.dot_test/test.js'];
const FILES_IN_IGNORED_DIR = ['test_to_ignore/in_test_ignore.js'];
const FILES_TO_IGNORE = ['ignored_module.js'];

describe('Utils', () => {
    describe('argsToCamelCase()', () => {
        it('should convert object', () => {
            const object = {
                'my-att': 'value',
                'my-attr-test': 'secondValue',
                'user-id': 'd7H9khHg',
                token: 'Ad7H9khHgd7H9khHg',
            };
            const expected = {
                myAtt: 'value',
                myAttrTest: 'secondValue',
                userId: 'd7H9khHg',
                token: 'Ad7H9khHgd7H9khHg',
            };
            const convertedObject = argsToCamelCase(object);
            expect(expected).to.be.eql(convertedObject);
        });
    });

    describe('createActZip()', () => {
        let previousCwd: string;
        beforeAll(async () => {
            // Create folder structure
            if (!existsSync(TEST_DIR)) ensureFolderExistsSync(TEST_DIR);
            previousCwd = process.cwd();

            process.chdir(TEST_DIR);

            FOLDERS.concat(FOLDERS_TO_IGNORE).forEach((folder) => ensureFolderExistsSync(folder));
            FILES.concat(FILES_TO_IGNORE, FILES_IN_IGNORED_DIR)
                .forEach((file) => writeFileSync(file, Math.random().toString(36).substring(7), { flag: 'w' }));

            const toIgnore = FOLDERS_TO_IGNORE.concat(FILES_TO_IGNORE).join('\n');
            writeFileSync('.gitignore', toIgnore, { flag: 'w' });
        });

        it('should create zip without files in .gitignore', async () => {
            const zipName = 'test.zip';
            const tempFolder = 'unzip_temp';
            ensureFolderExistsSync(tempFolder);
            const pathsToZip = await getActorLocalFilePaths();
            await createActZip(zipName, pathsToZip);

            // Unzip with same command as on Apify worker
            await execWithLog('unzip', ['-oq', zipName, '-d', tempFolder]);

            FOLDERS.forEach((folder) => expect(existsSync(join(tempFolder, folder))).to.be.true);
            FOLDERS_TO_IGNORE.forEach((folder) => expect(existsSync(join(tempFolder, folder))).to.be.false);
            FILES.forEach((file) => expect(existsSync(join(tempFolder, file))).to.be.true);
            FILES_IN_IGNORED_DIR.concat(FILES_TO_IGNORE).forEach((file) => expect(existsSync(join(tempFolder, file))).to.be.false);
        });

        afterAll(async () => {
            process.chdir(previousCwd);
            if (existsSync(TEST_DIR)) await rimrafPromised(TEST_DIR);
        });
    });
});
