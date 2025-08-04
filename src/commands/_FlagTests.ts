import { ApifyCommand } from '../lib/command-framework/apify-command.js';
import { Flags } from '../lib/command-framework/flags.js';

export class FlagTest extends ApifyCommand<typeof FlagTest> {
	static override name = '_flag';

	static override flags = {
		foo: Flags.string({
			description: 'Foo flag',
			required: true,
		}),
		bar: Flags.string({
			description: 'Bar flag',
		}),
		fooBar: Flags.string({
			description: 'Foo bar flag',
			// required: true,
		}),
		'spaced message': Flags.string({
			description: 'Spaced message flag',
		}),
		choice: Flags.string({
			description: 'Choices flag',
			aliases: ['alias1'],
			choices: ['1', '2', '3'],
		}),
		int: Flags.integer({
			default: 1,
		}),
	};

	override async run() {
		console.log(this.flags);
	}
}
