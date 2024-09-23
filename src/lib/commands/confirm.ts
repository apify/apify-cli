import inquirer, { type DistinctQuestion } from 'inquirer';

const yesNoConfirmation = ({ type }: { type: string }): DistinctQuestion => ({
	name: 'confirmed',
	type: 'confirm',
	message: `Are you sure you want to delete this ${type}?`,
	default: false,
});

const inputValidation = ({
	type,
	expectedValue,
	failureMessage,
}: { type: string; expectedValue: string; failureMessage: string }): DistinctQuestion => ({
	name: 'confirmed',
	type: 'input',
	message: `Are you sure you want to delete this ${type}? If so, please type in "${expectedValue}":`,
	validate(value) {
		if (value === expectedValue) {
			return true;
		}

		return failureMessage;
	},
});

export async function confirmAction({
	expectedValue,
	type,
	failureMessage,
}: { expectedValue?: string; type: string; failureMessage: string }): Promise<boolean> {
	const result = await inquirer.prompt<{ confirmed: boolean | string }>(
		expectedValue ? inputValidation({ type, expectedValue, failureMessage }) : yesNoConfirmation({ type }),
	);

	if (typeof result.confirmed === 'boolean') {
		return result.confirmed;
	}

	return result.confirmed === expectedValue;
}
