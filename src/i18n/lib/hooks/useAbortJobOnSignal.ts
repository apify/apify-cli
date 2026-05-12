import { defineMessages } from '../../../lib/i18n/index.js';

export const useAbortJobOnSignalMessages = defineMessages({
	en: {
		abortingBuild: {
			markdown: (md, colors) =>
				md(
					colors.gray(
						`Received ${colors.yellow('{signal}')}, aborting build "${colors.yellow('{jobId}')}" on the Apify platform...`,
					),
				),
			json: () => null,
		},
		abortBuildFailed: {
			markdown: 'Failed to abort build "{jobId}": {message}',
			json: () => null,
		},
		abortingRunGracefully: {
			markdown: (md, colors) =>
				md(
					colors.gray(
						`Received ${colors.yellow('{signal}')}, gracefully aborting {runLabel} "${colors.yellow('{jobId}')}" on the Apify platform... ${colors.dim('(press Ctrl+C again to abort immediately)')}`,
					),
				),
			json: () => null,
		},
		abortingRunImmediately: {
			markdown: (md, colors) =>
				md(
					colors.gray(
						`Received ${colors.yellow('{signal}')} again, aborting {runLabel} "${colors.yellow('{jobId}')}" immediately...`,
					),
				),
			json: () => null,
		},
		abortRunFailed: {
			markdown: 'Failed to abort run "{jobId}": {message}',
			json: () => null,
		},
	},
});
