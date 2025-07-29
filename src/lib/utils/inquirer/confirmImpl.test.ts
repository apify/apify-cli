import confirm from './confirmImpl.js';

const result = await confirm({
	message: 'Are you sure you want to delete this?',
	default: true,
});

console.log(result);
