import { Actor } from 'apify';

await Actor.init();

await Actor.setValue('STARTED', 'works');

const input = await Actor.getInput();

console.log('Input:', input);

if (input) {
	await Actor.setValue('RECEIVED_INPUT', input);
}

await Actor.exit();
