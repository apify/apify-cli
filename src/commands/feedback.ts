import { ApifyCommand } from '../lib/command-framework/apify-command.js';
import { Args } from '../lib/command-framework/args.js';
import { Flags } from '../lib/command-framework/flags.js';
import { detectAiAgent } from '../lib/hooks/telemetry/detectEnvironment.js';
import { sendEvent } from '../lib/hooks/telemetry/trackEvent.js';
import { useTelemetryState } from '../lib/hooks/telemetry/useTelemetryState.js';
import { useCLIMetadata } from '../lib/hooks/useCLIMetadata.js';
import { success } from '../lib/outputs.js';
import { printJsonToStdout } from '../lib/utils.js';

const MAX_TEXT_LENGTH = 2000;
const MAX_ID_LENGTH = 200;

function assertMaxLength(name: string, value: string | undefined, max: number) {
	if (value !== undefined && value.length > max) {
		throw new Error(`${name} can be at most ${max} characters long, but it's ${value.length}. Nothing was sent.`);
	}
}

export class FeedbackCommand extends ApifyCommand<typeof FeedbackCommand> {
	static override name = 'feedback' as const;

	static override description =
		'Sends feedback about the Apify CLI to the Apify team: report a problem, or tell us something worked well.\n' +
		"It's one-way, so you won't get a reply. For support, use https://apify.com/contact.\n" +
		"It's sent even when telemetry is disabled, because you asked to send it. Don't include personal data, credentials, or secrets.";

	static override group = 'Utilities';

	static override enableJsonFlag = true;

	static override examples = [
		{
			description: 'Report a problem in plain words. Quotes are optional.',
			command: 'apify feedback "apify push hangs on Windows after the build finishes"',
		},
		{
			description: 'Report a problem with a specific Actor.',
			command:
				'apify feedback "The README lists a startUrls field, but the input schema calls it urls" --actor-id <actorId> --category spec_mismatch',
		},
		{
			description: 'Report a problem as an agent, on its own initiative, with machine-readable output.',
			command:
				'apify feedback "apify runs ls --json returns an empty list right after a run starts" --category bug --source model --json',
		},
	];

	static override args = {
		message: Args.string({
			required: true,
			catchAll: true,
			description: `What happened, or what worked. At most ${MAX_TEXT_LENGTH} characters.`,
		}),
	};

	static override flags = {
		'actor-id': Flags.string({
			description: 'ID of the Actor the feedback is about.',
		}),
		'actor-run-id': Flags.string({
			description: 'ID of the Actor run the feedback is about.',
		}),
		'sentiment': Flags.string({
			description: 'How it went overall.',
			choices: ['positive', 'negative', 'neutral'] as const,
		}),
		'category': Flags.string({
			description: "What kind of feedback it is. Use improvement for suggestions that aren't bugs.",
			choices: ['bug', 'spec_mismatch', 'readme_unclear', 'missing_capability', 'improvement', 'worked_well'] as const,
		}),
		'source': Flags.string({
			description:
				'Who decided to send it: user means the user asked to send it, model means the agent sent it on its own.',
			choices: ['user', 'model'] as const,
		}),
		'expected': Flags.string({
			description: `What you expected to happen. At most ${MAX_TEXT_LENGTH} characters.`,
		}),
		'actual': Flags.string({
			description: `What actually happened. At most ${MAX_TEXT_LENGTH} characters.`,
		}),
		'sent-by': Flags.string({
			description:
				'Whether a human or an agent ran this command. Defaults to agent when the CLI detects an AI agent, otherwise human.',
			choices: ['human', 'agent'] as const,
		}),
	};

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-feedback';

	async run() {
		const message = this.args.message.trim();

		if (!message) {
			throw new Error('The feedback message is empty. Describe what happened, then try again.');
		}

		assertMaxLength('The feedback message', message, MAX_TEXT_LENGTH);
		assertMaxLength('--actor-id', this.flags.actorId, MAX_ID_LENGTH);
		assertMaxLength('--actor-run-id', this.flags.actorRunId, MAX_ID_LENGTH);
		assertMaxLength('--expected', this.flags.expected, MAX_TEXT_LENGTH);
		assertMaxLength('--actual', this.flags.actual, MAX_TEXT_LENGTH);

		const metadata = useCLIMetadata();
		const telemetryState = await useTelemetryState();
		const aiAgent = detectAiAgent();

		const sent = await sendEvent('CLI Reported Problem', {
			message,
			actor_id: this.flags.actorId,
			actor_run_id: this.flags.actorRunId,
			sentiment: this.flags.sentiment,
			category: this.flags.category,
			source: this.flags.source,
			expected: this.flags.expected,
			actual: this.flags.actual,
			app_version: metadata.version,
			os: metadata.platform,
			os_arch: metadata.arch,
			install_method: metadata.installMethod,
			// Commands record themselves after they finish, so this is still the command that ran before `feedback`.
			last_command: telemetryState.lastCommand,
			last_command_exit_code: telemetryState.lastCommandExitCode,
			sent_by: this.flags.sentBy ?? (aiAgent ? 'agent' : 'human'),
			ai_agent: aiAgent,
		});

		if (!sent) {
			throw new Error(
				"Your feedback couldn't be sent. Try again, or open an issue at https://github.com/apify/apify-cli/issues.",
			);
		}

		if (this.flags.json) {
			printJsonToStdout({ sent: true });
			return;
		}

		success({ message: 'Thanks for your feedback! It was sent to the Apify CLI team.' });
	}
}
