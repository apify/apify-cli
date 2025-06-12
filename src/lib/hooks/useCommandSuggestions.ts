import { jaroWinkler } from '@skyra/jaro-winkler';
import levenshtein from 'js-levenshtein';

import { commandRegistry } from '../command-framework/apify-command.js';
import { cliDebugPrint } from '../utils/cliDebugPrint.js';

export function useCommandSuggestions(inputString: string) {
	const allCommands = [...commandRegistry.entries()];

	const lowercasedCommandString = inputString.toLowerCase();

	const closestMatches = allCommands
		.map(([cmdString, cmdClass]) => {
			const lowercased = cmdString.toLowerCase();
			const cmdStringParts = cmdString.split(' ');
			const lastPart = cmdStringParts[cmdStringParts.length - 1].toLowerCase();

			const isAlias = cmdClass.aliases?.includes(lastPart) || cmdClass.hiddenAliases?.includes(lastPart) || false;

			const levenshteinDistance = levenshtein(lowercasedCommandString, lowercased);
			const jaroWinklerDistance = jaroWinkler(lowercasedCommandString, lowercased);

			const matches = levenshteinDistance <= 2 || jaroWinklerDistance >= 0.975;

			if (matches) {
				cliDebugPrint('useCommandSuggestions', {
					inputString: lowercasedCommandString,
					lowercased,
					matches,
					levenshtein: levenshteinDistance,
					jaroWinkler: jaroWinklerDistance,
				});

				if (!isAlias) {
					return `${lowercased}`;
				}

				return `${lowercased} (alias for ${cmdClass.name})`;
			}

			return null;
		})
		.filter((item) => item !== null);

	return closestMatches;
}
