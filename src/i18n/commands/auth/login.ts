import { defineMessages } from '../../../lib/i18n/index.js';

export const AuthLoginCommandMessages = defineMessages({
	en: {
		loggedInSuccess: {
			markdown: (md, colors) =>
				md(`You are logged in to Apify as {userName}. ${colors.gray('Your token is stored at {authFilePath}.')}`),
			json: () => null,
		},
		invalidTokenLogin: {
			markdown: 'Login to Apify failed, the provided API token is not valid.',
			json: () => null,
		},
		requestMissingApiToken: {
			markdown: 'Request did not contain API token',
			json: () => null,
		},
		loginFailedWithError: {
			markdown: 'Login to Apify failed with error: {message}',
			json: () => null,
		},
		loginFailedWindowClosed: {
			markdown: 'Login to Apify failed, the console window was closed.',
			json: () => null,
		},
		loginFailedActionCanceled: {
			markdown: 'Login to Apify failed, the action was canceled in the Apify Console.',
			json: () => null,
		},
		loginFailed: {
			markdown: 'Login to Apify failed.',
			json: () => null,
		},
		openingConsole: {
			markdown: 'Opening Apify Console at "{consoleHref}"...',
			json: () => null,
		},
	},
});
