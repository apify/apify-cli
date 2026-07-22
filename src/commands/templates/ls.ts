import { fetchManifest } from '@apify/actor-templates';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { CompactMode, ResponsiveTable } from '../../lib/commands/responsive-table.js';
import { info, simpleLog } from '../../lib/outputs.js';
import { printJsonToStdout } from '../../lib/utils.js';

const table = new ResponsiveTable({
	allColumns: ['Template', 'Label', 'Language', 'Use cases'],
	mandatoryColumns: ['Template', 'Language', 'Use cases'],
});

export class TemplatesLsCommand extends ApifyCommand<typeof TemplatesLsCommand> {
	static override name = 'ls' as const;

	static override description =
		'Prints all available Actor templates, including the use cases and language each one supports.';

	static override examples = [
		{
			description: 'List all available templates.',
			command: 'apify templates ls',
		},
		{
			description: 'List templates as JSON (includes the use-case tags for scripting).',
			command: 'apify templates ls --json',
		},
	];

	static override enableJsonFlag = true;

	async run() {
		const { json } = this.flags;

		const manifest = await fetchManifest().catch((err) => {
			throw new Error(`Could not fetch template list from server. Cause: ${(err as Error)?.message}`);
		});

		if (json) {
			printJsonToStdout(manifest.templates);
			return;
		}

		if (manifest.templates.length === 0) {
			info({ message: 'There are no templates available.', stdout: true });
			return;
		}

		for (const template of manifest.templates) {
			table.pushRow({
				Template: template.name,
				Label: template.label,
				Language: template.category,
				'Use cases': (template.useCases ?? []).join(', '),
			});
		}

		simpleLog({
			message: table.render(CompactMode.WebLikeCompact),
			stdout: true,
		});
	}
}
