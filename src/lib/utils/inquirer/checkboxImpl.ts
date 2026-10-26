import {
	createPrompt,
	isDownKey,
	isEnterKey,
	isSpaceKey,
	isUpKey,
	makeTheme,
	type Status,
	useKeypress,
	usePagination,
	usePrefix,
	useState,
} from '@inquirer/core';

export interface CheckboxChoice<Value = unknown> {
	name: string;
	value: Value;
	checked?: boolean;
}

interface CheckboxOptions {
	message: string;
	choices: CheckboxChoice[];
	pageSize?: number;
	loop?: boolean;
}

const HELP_TIP = '(space to toggle, a for all, i to invert, enter to confirm)';

/**
 * A multi-select prompt on `@inquirer/core`, so the CLI does not pull in `@inquirer/checkbox`. Up and down
 * move, space toggles the active item, `a` toggles every item, `i` inverts the selection, enter confirms.
 */
export const checkboxImpl: ReturnType<typeof createPrompt<unknown[], CheckboxOptions>> = createPrompt<
	unknown[],
	CheckboxOptions
>((config, done) => {
	const { choices, pageSize = 7, loop = true } = config;
	const theme = makeTheme();
	const [status, setStatus] = useState<Status>('idle');
	const [active, setActive] = useState(0);
	const [checked, setChecked] = useState<boolean[]>(() => choices.map((choice) => !!choice.checked));
	const prefix = usePrefix({ status, theme });

	useKeypress((key, rl) => {
		if (isEnterKey(key)) {
			setStatus('done');
			done(choices.filter((_, index) => checked[index]).map((choice) => choice.value));

			return;
		}

		if (isUpKey(key) || isDownKey(key)) {
			const next = active + (isUpKey(key) ? -1 : 1);

			if (loop) {
				setActive((next + choices.length) % choices.length);
			} else if (next >= 0 && next < choices.length) {
				setActive(next);
			}
		} else if (isSpaceKey(key)) {
			setChecked(checked.map((value, index) => (index === active ? !value : value)));
		} else if (key.name === 'a') {
			const allChecked = checked.every(Boolean);
			setChecked(checked.map(() => !allChecked));
		} else if (key.name === 'i') {
			setChecked(checked.map((value) => !value));
		}

		// Readline still buffers every key; drop it so the cursor placement does not drift, as confirmImpl does.
		rl.clearLine(0);
	});

	const page = usePagination({
		items: choices,
		active,
		pageSize,
		loop,
		renderItem: ({ item, index, isActive }) => {
			const line = `${checked[index] ? '[x]' : '[ ]'} ${item.name}`;

			return isActive ? theme.style.highlight(`> ${line}`) : `  ${line}`;
		},
	});

	const message = theme.style.message(config.message, status);

	if (status === 'done') {
		const answer = choices
			.filter((_, index) => checked[index])
			.map((choice) => choice.name)
			.join(', ');

		return `${prefix} ${message} ${theme.style.answer(answer)}`;
	}

	return `${prefix} ${message} ${theme.style.help(HELP_TIP)}\n${page}`;
});
