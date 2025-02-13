// oclif readme --readme-path=docs/reference.md

import { readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { execa } from 'execa';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- used when / if we want the link to commands
import type { Code, Link, Paragraph, PhrasingContentMap } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';

const finalOutputFile = new URL('../docs/reference.md', import.meta.url);
const temporaryReferenceFile = fileURLToPath(new URL('./temporary-reference.md', import.meta.url));
const referenceTemplateFile = new URL('./reference-template.md', import.meta.url);

// Make sure the temporary file is the empty template
await writeFile(temporaryReferenceFile, '<!-- commands -->\n<!-- commandsstop -->');

// Generate the oclif reference
await execa`oclif readme --readme-path=${temporaryReferenceFile}`;

// Read the temporary file, reference template
const temporaryReferenceString = await readFile(temporaryReferenceFile, 'utf-8');
const referenceTemplateString = await readFile(referenceTemplateFile, 'utf-8');

// Keep in sync with the comments used in the reference template
// If you have a comment like `<!-- wow-apify-commands-start -->` in the reference-template.md file, you need to add `wow-apify` in this array and handle mappings accordingly
const CommandCategories = [
	'general',
	'auth',
	'actor-dev',
	'actor-basic',
	'actor-deploy',
	'actor-build',
	'actor-run',
	'dataset',
	'keyval',
	'reqqueue',
	'task',
] as const;

type CommandCategories = (typeof CommandCategories)[number];

const mappedCommands = Object.fromEntries(CommandCategories.map((category) => [category, [] as string[]])) as Record<
	CommandCategories,
	string[]
>;

const commands = new Map<string, Map<string | undefined, string>>([]);

// Get the AST for the temporary file
const ast = fromMarkdown(temporaryReferenceString).children;

if (ast.length === 0) {
	throw new Error('No commands found in the temporary reference file! This should not be possible');
}

for (let idx = 0; idx < ast.length; idx++) {
	const node = ast[idx];

	// The structure of a command definition is heading -> command description -> usage string -> link to code
	// So even if we don't increment idx at the end, we will skip invalid nodes
	if (node.type !== 'heading') {
		continue;
	}

	const [headingNodeContent] = node.children as [PhrasingContentMap['inlineCode']];

	// We know that right after the command name we have the command description
	const [commandDescription] = (ast[idx + 1] as Paragraph).children as [PhrasingContentMap['text']];

	// And then we have the usage code
	const code = ast[idx + 2] as Code;

	// Last we have the paragraph, code is here if we ever need it (Paragraph with 1 children of type Emphasis with 2 children (Text, Link))
	// const linkToCode = ((ast[idx + 3] as Paragraph).children as [PhrasingContentMap['emphasis']])[0].children as [
	// 	Text,
	// 	Link,
	// ];

	const commandName = headingNodeContent.value;

	const commandString = [
		`##### \`${commandName}\``,
		'',
		commandDescription.value,
		'',
		`\`\`\`\n${code.value}\n\`\`\``,
	].join('\n');

	// Find the category of the command
	const commandParts = commandName.split(' ');

	if (commandParts.length < 2) {
		console.error(`Command ${commandName} does not have a category?`, { commandName, commandParts, commandString });

		continue;
	}

	const [, command, rawSubcommand] = commandParts;

	const existing = commands.get(command);

	const subcommand = /[A-Z]/i.test(rawSubcommand?.[0] || '') ? rawSubcommand : undefined;

	if (!existing) {
		commands.set(command, new Map([[subcommand, commandString]]));
	} else {
		existing.set(subcommand, commandString);
	}
}

// console.log(
// 	Object.fromEntries([...commands.entries()].map(([key, value]) => [key, Object.fromEntries(value.entries())])),
// );

const actorNamespace = commands.get('actor')!;
const actorsNamespace = commands.get('actors')!;
const buildsNamespace = commands.get('builds')!;
const callCommand = commands.get('call')!.get(undefined)!;
const createCommand = commands.get('create')!.get(undefined)!;
const datasetsNamespace = commands.get('datasets')!;
const helpCommand = commands.get('help')!.get(undefined)!;
const infoCommand = commands.get('info')!.get(undefined)!;
const initCommand = commands.get('init')!.get(undefined)!;
const keyValueStoresNamespace = commands.get('key-value-stores')!;
const loginCommand = commands.get('login')!.get(undefined)!;
const logoutCommand = commands.get('logout')!.get(undefined)!;
const pullCommand = commands.get('pull')!.get(undefined)!;
const pushCommand = commands.get('push')!.get(undefined)!;
const requestQueuesNamespace = commands.get('request-queues')!;
const runCommand = commands.get('run')!.get(undefined)!;
const runsNamespace = commands.get('runs')!;
const secretsNamespace = commands.get('secrets')!;
const taskNamespace = commands.get('task')!;
const validateSchemaCommand = commands.get('validate-schema')!.get(undefined)!;

// Organize commands in the order thats requested, and remove them from the map

// #region General

mappedCommands.general.push(helpCommand);
commands.delete('help');

// #endregion

// #region Auth

mappedCommands.auth.push(loginCommand);
commands.delete('login');

mappedCommands.auth.push(logoutCommand);
commands.delete('logout');

mappedCommands.auth.push(infoCommand);
commands.delete('info');

for (const str of secretsNamespace.values()) {
	mappedCommands.auth.push(str);
}
commands.delete('secrets');

// #endregion

// #region Actor Dev

mappedCommands['actor-dev'].push(createCommand);
commands.delete('create');

mappedCommands['actor-dev'].push(initCommand);
commands.delete('init');

mappedCommands['actor-dev'].push(runCommand);
commands.delete('run');

mappedCommands['actor-dev'].push(validateSchemaCommand);
commands.delete('validate-schema');

// #endregion

// #region Actor Basic

mappedCommands['actor-basic'].push(actorsNamespace.get(undefined)!);
actorsNamespace.delete(undefined);

mappedCommands['actor-basic'].push(actorsNamespace.get('ls')!);
actorsNamespace.delete('ls');

mappedCommands['actor-basic'].push(actorsNamespace.get('rm')!);
actorsNamespace.delete('rm');

for (const str of actorNamespace.values()) {
	mappedCommands['actor-basic'].push(str);
}
commands.delete('actor');

// #endregion

// #region Actor Deploy

mappedCommands['actor-deploy'].push(pushCommand.split('\n')[0]);
commands.delete('push');

mappedCommands['actor-deploy'].push(actorsNamespace.get('push')!);
actorsNamespace.delete('push');

mappedCommands['actor-deploy'].push(pullCommand.split('\n')[0]);
commands.delete('pull');

mappedCommands['actor-deploy'].push(actorsNamespace.get('pull')!);
actorsNamespace.delete('pull');

mappedCommands['actor-deploy'].push(callCommand.split('\n')[0]);
commands.delete('call');

mappedCommands['actor-deploy'].push(actorsNamespace.get('call')!);
actorsNamespace.delete('call');

mappedCommands['actor-deploy'].push(actorsNamespace.get('start')!);
actorsNamespace.delete('start');

mappedCommands['actor-deploy'].push(actorsNamespace.get('info')!);
actorsNamespace.delete('info');

// #endregion

// #region Actor Build

mappedCommands['actor-build'].push(buildsNamespace.get(undefined)!);
buildsNamespace.delete(undefined);

mappedCommands['actor-build'].push(buildsNamespace.get('create')!);
buildsNamespace.delete('create');

// actors build
mappedCommands['actor-build'].push(actorsNamespace.get('build')!);
actorsNamespace.delete('build');

// remainder of builds namespace
for (const str of buildsNamespace.values()) {
	mappedCommands['actor-build'].push(str);
}

commands.delete('builds');

// #endregion

// #region Actor Run

for (const str of runsNamespace.values()) {
	mappedCommands['actor-run'].push(str);
}
commands.delete('runs');

// #endregion

// #region Dataset

for (const str of datasetsNamespace.values()) {
	mappedCommands.dataset.push(str);
}
commands.delete('datasets');

// #endregion

// #region KeyVal

for (const str of keyValueStoresNamespace.values()) {
	mappedCommands.keyval.push(str);
}
commands.delete('key-value-stores');

// #endregion

// #region ReqQueue

for (const str of requestQueuesNamespace.values()) {
	mappedCommands.reqqueue.push(str);
}
commands.delete('request-queues');

// #endregion

// #region Task

for (const str of taskNamespace.values()) {
	mappedCommands.task.push(str);
}
commands.delete('task');

// #endregion

// ------

for (const [namespace, entries] of commands) {
	if (entries.size) {
		throw new Error(
			`Namespace ${namespace} still has entries that are not properly mapped: ${[...entries.keys()].join(', ')}`,
		);
	}
}

// Finally, walk the template, replacing the placeholders with the actual commands

let finalString = referenceTemplateString;

for (const [category, commandList] of Object.entries(mappedCommands)) {
	const startString = `<!-- ${category}-commands-start -->`;
	const endString = `<!-- ${category}-commands-end -->`;

	if (referenceTemplateString.includes(startString) && !referenceTemplateString.includes(endString)) {
		throw new Error(`Category ${category} has a start placeholder but no end placeholder in reference template!`);
	}

	const categoryCommands = commandList.join('\n\n');

	finalString = finalString.replace(startString, `${startString}\n${categoryCommands}`);
}

// Write the final reference file
await writeFile(finalOutputFile, finalString);

// Cleanup the temporary file
await rm(temporaryReferenceFile);
