const chalk = require('chalk');
const inquirer = require('inquirer');
const https = require('https');
const { pipeline } = require('stream');
const { promisify } = require('util');
const fs = require('fs');
const { validateActorName } = require('./utils');
const {
    warning,
} = require('./outputs');

const PROGRAMMING_LANGUAGES = ['JavaScript', 'TypeScript', 'Python'];

/**
 * @param {string} url
 * @returns {Promise<unknown>}
 */
exports.httpsGet = async (url) => {
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            // Handle redirects
            if (response.statusCode === 301 || response.statusCode === 302) {
                resolve(exports.httpsGet(response.headers.location));
                // Destroy the response to close the HTTP connection, otherwise this hangs for a long time with Node 19+ (due to HTTP keep-alive).
                response.destroy();
            } else {
                resolve(response);
            }
        }).on('error', reject);
    });
};

/**
 * @param {string} maybeActorName
 * @returns {Promise<string>}
 */
exports.ensureValidActorName = async (maybeActorName) => {
    if (maybeActorName) {
        validateActorName(maybeActorName);
        return maybeActorName;
    }
    return promptActorName();
};

/**
 * @param {string} maybeTemplateName
 * @param {Promise<object>} manifestPromise
 * @returns {Promise<object>}
 */
exports.getTemplateDefinition = async (maybeTemplateName, manifestPromise) => {
    const manifest = await manifestPromise;
    // If the fetch failed earlier, the resolve value of
    // the promise will be the error from fetching the manifest.
    if (manifest instanceof Error) throw manifest;

    if (maybeTemplateName) {
        const templateDefinition = manifest.templates.find((t) => t.name === maybeTemplateName);
        if (!templateDefinition) {
            throw new Error(`Could not find the selected template: ${maybeTemplateName} in the list of templates.`);
        }
        return templateDefinition;
    }

    return executePrompts(manifest);
};

/**
 * Fetch local readme suffix from the manifest and append it to the readme.
 * @param {string} readmePath
 * @param {Promise<object>} manifestPromise
 */
exports.enhanceReadmeWithLocalSuffix = async (readmePath, manifestPromise) => {
    const manifest = await manifestPromise;
    // If the fetch failed earlier, the resolve value of
    // the promise will be the error from fetching the manifest.
    if (manifest instanceof Error) throw manifest;

    try {
        const suffixStream = await this.httpsGet(manifest.localReadmeSuffixUrl);
        const readmeStream = fs.createWriteStream(readmePath, { flags: 'a' });
        readmeStream.write('\n\n');
        await promisify(pipeline)(suffixStream, readmeStream);
    } catch (err) {
        warning(`Could not append local development instructions to README.md. Cause: ${err.message}`);
    }
};

/**
 * Inquirer does not have a native way to "go back" between prompts.
 * @param {object} manifest
 * @returns {Promise<object>}
 */
async function executePrompts(manifest) {
    const programmingLanguage = await promptProgrammingLanguage();
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const templateDefinition = await promptTemplateDefinition(manifest, programmingLanguage);
        if (templateDefinition) {
            const shouldInstall = await promptTemplateInstallation(templateDefinition);
            if (shouldInstall) {
                return templateDefinition;
            }
        } else {
            return executePrompts(manifest);
        }
    }
}

/**
 * @returns {Promise<string>}
 */
async function promptActorName() {
    const answer = await inquirer.prompt([{
        name: 'actorName',
        message: 'Name of your new actor:',
        type: 'input',
        validate: (promptText) => {
            try {
                validateActorName(promptText);
            } catch (err) {
                return err.message;
            }
            return true;
        },
    }]);
    return answer.actorName;
}

/**
 * @returns {Promise<string>}
 */
async function promptProgrammingLanguage() {
    const answer = await inquirer.prompt([{
        type: 'list',
        name: 'programmingLanguage',
        message: 'Choose the programming language of your new actor:',
        default: PROGRAMMING_LANGUAGES[0],
        choices: PROGRAMMING_LANGUAGES,
        loop: false,
    }]);
    return answer.programmingLanguage;
}

/**
 * @param {object} manifest
 * @param {string} programmingLanguage
 * @returns {Promise<object>} template definition
 */
async function promptTemplateDefinition(manifest, programmingLanguage) {
    const choices = manifest.templates
        .filter((t) => {
            return t.category.toLowerCase() === programmingLanguage.toLowerCase();
        })
        .map((t) => {
            return {
                name: t.label,
                value: t,
            };
        });

    choices.push(new inquirer.Separator());
    choices.push({
        name: 'Go back',
        value: false,
    });

    const answer = await inquirer.prompt([{
        type: 'list',
        name: 'templateDefinition',
        message: 'Choose a template for your new actor. Detailed information about the template will be shown in the next step.',
        default: choices[0],
        choices,
        loop: false,
        pageSize: 8,
    }]);

    return answer.templateDefinition;
}

/**
 * @param {object} templateDefinition
 * @returns {Promise<string>}
 */
async function promptTemplateInstallation(templateDefinition) {
    const choices = [{ name: `Install template`, value: true }];
    choices.push(new inquirer.Separator());
    choices.push({ name: 'Go back', value: false });

    const message = 'Do you want to install the following template?';
    const label = chalk.underline(templateDefinition.label);
    const description = chalk.dim(templateDefinition.description);
    const suffix = `\n ${label}:\n ${description}`;

    const answer = await inquirer.prompt([{
        type: 'list',
        name: 'shouldInstall',
        message,
        suffix,
        default: choices[0],
        choices,
        loop: false,
    }]);

    return answer.shouldInstall;
}
