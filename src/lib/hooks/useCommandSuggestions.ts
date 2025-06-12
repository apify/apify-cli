import { jaroWinkler } from '@skyra/jaro-winkler';
import levenshtein from 'js-levenshtein';

import { commandRegistry } from '../command-framework/apify-command.js';

export function useCommandSuggestions(inputString: string) {
	const allCommands = [...commandRegistry.entries()];

	const lowercasedCommandString = inputString.toLowerCase();

	const closestMatches = allCommands
		.map(([cmdString, cmdClass]) => {
			const lowercased = cmdString.toLowerCase();

			const matches =
				levenshtein(lowercasedCommandString, lowercased) <= 2 ||
				jaroWinkler(lowercasedCommandString, lowercased) >= 0.95;

			if (matches) {
				if (cmdString === cmdClass.name) {
					return cmdString;
				}

				return `${cmdString} (alias for ${cmdClass.name})`;
			}

			return null;
		})
		.filter((item) => item !== null);

	return closestMatches;
}
