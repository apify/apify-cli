import { Help } from '@oclif/core';

/**
 * Custom help class that overrides how oclif renders help screens.
 *
 * It is registered through package.json.
 *
 * Refer to the oclif documentation for more information:
 * https://oclif.io/docs/help_classes/#custom-help
 *
 * Note: The CLI was crashing when printing help with the latest oclif packages. Be careful when upgrading.
 */
export default class ApifyOclifHelp extends Help {
	override async showRootHelp() {
		await super.showRootHelp();

		this.log(
			this.section(
				'TROUBLESHOOTING',
				this.wrap(
					'For general support, reach out to us at https://apify.com/contact\n\n' +
						'If you believe you are encountering a bug, file it at https://github.com/apify/apify-cli/issues/new',
				),
			),
		);
	}
}
