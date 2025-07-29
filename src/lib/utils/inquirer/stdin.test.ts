import { readStdin } from '../../commands/read-stdin.js';
import { useUserInput } from '../../hooks/user-confirmations/useUserInput.js';

const stdin = await readStdin();
// const stdin: string | undefined = undefined;
// console.log(stdin);

const input = await useUserInput({
	message: 'test',
	providedConfirmFromStdin: stdin?.toString(),
});

console.log(input);

const input2 = await useUserInput({
	message: 'test',
	// providedConfirmFromStdin: stdin?.toString(),
});

console.log(input2);
