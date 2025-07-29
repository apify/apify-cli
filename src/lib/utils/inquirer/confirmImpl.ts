/*
The following code is taken from https://github.com/SBoudrias/Inquirer.js/blob/a56b48f06447feb3881b6f670394e17c60a4189b/packages/confirm/src/index.ts
and altered for our use case.

Copyright (c) 2025 Simon Boudrias

Permission is hereby granted, free of charge, to any person
obtaining a copy of this software and associated documentation
files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.
*/

import { createPrompt, isEnterKey, makeTheme, type Status, useKeypress, usePrefix, useState } from '@inquirer/core';

interface ConfirmOptions {
	message: string;
	default?: boolean;
}

function getBooleanValue(value: string, defaultValue?: boolean): boolean {
	let answer = defaultValue !== false;

	if (/^(y|yes)/i.test(value)) {
		answer = true;
	} else if (/^(n|no)/i.test(value)) {
		answer = false;
	}

	return answer;
}

function boolToString(value: boolean): string {
	return value ? 'Yes' : 'No';
}

export default createPrompt<boolean, ConfirmOptions>((config, done) => {
	const transformer = boolToString;
	const [status, setStatus] = useState<Status>('idle');
	const [value, setValue] = useState('');
	const theme = makeTheme();
	const prefix = usePrefix({ status, theme });

	useKeypress((key, rl) => {
		// Pressing enter will submit the default answer
		if (isEnterKey(key)) {
			const answer = getBooleanValue(value, config.default);
			setValue(transformer(answer));
			setStatus('done');
			done(answer);

			return;
		}

		// Pressing tab will toggle the default answer (redundant, but sure)
		if (key.name === 'tab') {
			const answer = boolToString(!getBooleanValue(value, config.default));
			rl.clearLine(0); // Remove the tab character.
			rl.write(answer);
			setValue(answer);

			return;
		}

		// Apify edit: if you write y or n, it is directly treated as the answer (skipping the need to press enter)
		if (key.name === 'y' || key.name === 'n') {
			const answer = getBooleanValue(key.name, config.default);
			setValue(transformer(answer));
			setStatus('done');
			done(answer);

			return;
		}

		// Ignore all other keys (including backspace)
		rl.clearLine(0);
		rl.write(value);
		setValue(rl.line);
	});

	let formattedValue = value;
	let defaultValue = '';
	if (status === 'done') {
		formattedValue = theme.style.answer(value);
	} else {
		defaultValue = ` ${theme.style.defaultAnswer(config.default === false ? 'y/N' : 'Y/n')}`;
	}

	const message = theme.style.message(config.message, status);
	return `${prefix} ${message}${defaultValue} ${formattedValue}`;
});
