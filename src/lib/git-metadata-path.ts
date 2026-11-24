const isGitMetadataSegment = (segment: string) => {
	const normalized = segment
		.replace(/\p{Default_Ignorable_Code_Point}/gu, '')
		.toLowerCase()
		.replace(/:.*$/, '')
		.replace(/[. ]+$/, '');

	return normalized === '.git' || normalized === 'git~1';
};

export const hasGitMetadataSegment = (path: string) => path.split(/[\\/]/).some(isGitMetadataSegment);
