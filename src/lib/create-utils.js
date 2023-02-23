const inquirer = require('inquirer');
const actorTemplates = require('@apify/actor-templates');
const { validateActorName } = require('./utils');

const PROGRAMMING_LANGUAGES = ['JavaScript', 'TypeScript', 'Python'];

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
 * @returns {Promise<object>}
 */
exports.getTemplateDefinition = async (maybeTemplateName) => {
    const manifest = await actorTemplates.fetchManifest();
    if (maybeTemplateName) {
        return manifest.templates.find((t) => t.name === maybeTemplateName);
    }

    const programmingLanguage = await promptProgrammingLanguage();
    while (true) {
        const templateDefinition = await promptTemplateDefinition(manifest, programmingLanguage);
        const shouldInstall = await promptTemplateInstallation(templateDefinition);
        if (shouldInstall) return templateDefinition;
    }
};

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
    const choices = PROGRAMMING_LANGUAGES.map((lang) => ({
        name: `👉 ${lang}`,
        value: lang,
    }));
    const answer = await inquirer.prompt([{
        type: 'list',
        name: 'programmingLanguage',
        message: 'Choose the programming language of your new actor:',
        default: choices[0],
        choices,
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
                name: `👉 ${t.label}`,
                value: t,
            };
        });

    const answer = await inquirer.prompt([{
        type: 'list',
        name: 'templateDefinition',
        message: 'Choose a template for your new actor. A description of each template will be shown after selection.'
            + ' You\'ll be able to go back to choose another template.',
        default: choices[0],
        choices,
        loop: false,
        pageSize: 8, // Due to the answers wrapping, the prompt looks best if the `pageSize` is a multiple of 2
    }]);

    return answer.templateDefinition;
}

/**
 * @param {object} templateDefinition
 * @returns {Promise<string>}
 */
async function promptTemplateInstallation(templateDefinition) {
    const choices = [{
        name: `✅ Install ${templateDefinition.label}`,
        value: true,
    }, {
        name: '⏪ Go back',
        value: false,
    }];
    const answer = await inquirer.prompt([{
        type: 'list',
        name: 'shouldInstall',
        message: `Chosen template: ${templateDefinition.label} - ${templateDefinition.description} \n 🚀 Do you want to install it?`,
        default: choices[0],
        choices,
        loop: false,
    }]);

    return answer.shouldInstall;
}
