// Validate date query params
export function isValidDate( dateString: string | undefined ): boolean {
	if ( !dateString ) return true;
	const date = new Date( dateString );
	return !isNaN( date.getTime() );
}
