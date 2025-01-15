import { ApifyCommand } from '../../lib/apify_command.js';
import { LOCAL_CONFIG_PATH } from '../../lib/consts.js';

export class SecretsIndexCommand extends ApifyCommand<typeof SecretsIndexCommand> {
	static override description =
		`Manages secure environment variables for Actors.\n\n` +
		`Example:\n` +
		`$ apify secrets add mySecret TopSecretValue123\n\n` +
		`The "mySecret" value can be used in an environment variable defined in ${LOCAL_CONFIG_PATH} file by adding the "@"\n` +
		`prefix:\n\n` +
		`{\n` +
		`  "actorSpecification": 1,\n` +
		`  "name": "my_actor",\n` +
		`  "environmentVariables": { "SECRET_ENV_VAR": "@mySecret" },\n` +
		`  "version": "0.1"\n` +
		`}\n\n` +
		`When the Actor is pushed to Apify cloud, the "SECRET_ENV_VAR" and its value is stored as a secret environment variable\n` +
		`of the Actor.\n`;

	async run() {
		await this.printHelp();
	}
}
