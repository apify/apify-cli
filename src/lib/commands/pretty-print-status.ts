import type { ACTOR_JOB_STATUSES, ACTOR_JOB_TERMINAL_STATUSES } from '@apify/consts';
import chalk from 'chalk';

// TIMED-OUT -> Timed Out
// ABORTED -> Aborted
export function prettyPrintStatus(
	status: (typeof ACTOR_JOB_STATUSES)[keyof typeof ACTOR_JOB_STATUSES] | (typeof ACTOR_JOB_TERMINAL_STATUSES)[number],
) {
	switch (status) {
		case 'READY':
			return chalk.green('Ready');
		case 'RUNNING':
			return chalk.blue('Running');
		case 'SUCCEEDED':
			return chalk.green('Succeeded');
		case 'FAILED':
			return chalk.red('Failed');
		case 'ABORTING':
			return chalk.yellow('Aborting');
		case 'ABORTED':
			return chalk.red('Aborted');
		case 'TIMING-OUT':
			return chalk.yellow('Timing Out');
		case 'TIMED-OUT':
			return chalk.red('Timed Out');
		default:
			return chalk.gray(
				(status as string)
					.split('-')
					.map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
					.join(' '),
			);
	}
}
