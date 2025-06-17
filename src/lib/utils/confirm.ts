import inquirer, { type DistinctQuestion } from 'inquirer';

const yesNoConfirmation = ({ type, message }: { type: string; message?: string }) =>
	({
		name: 'confirmed',
		type: 'confirm',
		message: message ?? `Are you sure you want to delete this ${type}?`,
		default: false,
	}) as const satisfies DistinctQuestion;

const inputValidation = ({
	type,
	expectedValue,
	failureMessage = 'That is not the correct input!',
	message = `Are you sure you want to delete this ${type}? If so, please type in "${expectedValue}":`,
}: {
	type: string;
	expectedValue: string;
	failureMessage?: string;
	message?: string;
}) =>
	({
		name: 'confirmed',
		type: 'input',
		message,
		validate(value) {
			if (value === expectedValue) {
				return true;
			}

			return failureMessage;
		},
	}) as const satisfies DistinctQuestion;

export async function confirmAction({
	expectedValue,
	type,
	failureMessage,
	message,
}: {
	type: string;
	expectedValue?: string;
	failureMessage?: string;
	message?: string;
}): Promise<boolean> {
	const result = await inquirer.prompt<{ confirmed: boolean | string }>(
		expectedValue
			? inputValidation({ type, expectedValue, failureMessage, message })
			: yesNoConfirmation({ type, message }),
	);

	if (typeof result.confirmed === 'boolean') {
		return result.confirmed;
	}

	return result.confirmed === expectedValue;
}
