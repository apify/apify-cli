import type { Actor } from 'apify-client';

import { defineMessages } from './defineMessages.js';
// import { md } from './md.js';
import { t } from './t.js';

const messages = defineMessages({
	en: {
		// String form: ICU placeholders extracted directly.
		greet: {
			markdown: 'hi **{actorName}**',
			json: (actor: Actor) => actor,
		},
		// Function form: same inference, plus inline color helpers. Wrap the
		// template in `md(...)` so TypeScript preserves the literal across
		// the `colors.X(...)` interpolations.
		warn: {
			markdown: (md, colors) => md(`${colors.yellow('Warning')}: actor ${colors.bgCyan('{actorName}')} is missing`),
			json: (actor: Actor) => actor,
		},
	},
});

declare const actor: Actor;

// `messages.greet` and `messages.warn` both surface
//   `{ actorName: string; jsonParams: [actor: Actor] }`
// to the call site.
console.log(t(messages.greet, { actorName: actor.name, jsonParams: [actor] }));
console.log(t(messages.warn, { actorName: actor.name, jsonParams: [actor] }));
