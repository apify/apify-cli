import { Flags } from '@oclif/core';
import inquirer from 'inquirer';

import { ApifyCommand } from '../lib/apify_command.js';
import { error, success } from '../lib/outputs.js';
import { useApifyIdentity } from '../lib/telemetry.js';
import { getLocalUserInfo, getLoggedClient } from '../lib/utils.js';

export class LoginCommand extends ApifyCommand<typeof LoginCommand> {
    static override description = 'Logs in to your Apify account using a provided API token.\nThe API token and other account '
    + 'information is stored in the ~/.apify directory, from where it is read by all other "apify" commands. '
    + 'To log out, call "apify logout".';

    static override flags = {
        token: Flags.string({
            char: 't',
            description: '[Optional] Apify API token',
            required: false,
        }),
    };

    async run() {
        let { token } = this.flags;

        if (!token) {
            console.log('Enter your Apify API token. You can find it at https://console.apify.com/account#/integrations');
            const tokenPrompt = await inquirer.prompt<{ token: string }>([{ name: 'token', message: 'token:', type: 'password' }]);
            ({ token } = tokenPrompt);
        }

        const isUserLogged = await getLoggedClient(token);
        const userInfo = await getLocalUserInfo();
        await useApifyIdentity(userInfo.id!);
        return isUserLogged
            ? success(`You are logged in to Apify as ${userInfo.username || userInfo.id}!`)
            : error('Login to Apify failed, the provided API token is not valid.');
    }
}
