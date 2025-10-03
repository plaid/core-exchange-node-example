/**
 * Environment configuration utilities
 */

/**
 * Get a required environment variable with optional fallback
 * Exits the process if the variable is not found and no fallback is provided
 */
export function getRequiredEnv( name: string, fallback?: string ): string {
	const value = process.env[name] || fallback;
	if ( !value ) {
		// eslint-disable-next-line no-console
		console.error( `Missing required environment variable: ${ name }` );
		process.exit( 1 );
	}
	return value;
}

/**
 * Get a required environment variable as a number with optional fallback
 * Exits the process if the variable is not found, fallback is not provided, or value is not a valid number
 */
export function getRequiredEnvNumber( name: string, fallback?: number ): number {
	const value = process.env[name];
	const num = value ? Number( value ) : fallback;
	if ( num === undefined || isNaN( num ) ) {
		// eslint-disable-next-line no-console
		console.error( `Environment variable ${ name } must be a valid number${ fallback !== undefined ? `, got: ${ value }` : "" }` );
		process.exit( 1 );
	}
	return num;
}

/**
 * Get an optional environment variable with a default value
 */
export function getOptionalEnv( name: string, defaultValue: string ): string {
	return process.env[name] || defaultValue;
}

/**
 * Get an optional environment variable as a boolean
 */
export function getEnvBoolean( name: string, defaultValue = false ): boolean {
	const value = process.env[name];
	if ( value === undefined ) return defaultValue;
	return value.toLowerCase() === "true" || value === "1";
}

/**
 * Validate that all required environment variables are present
 * This can be used for environment validation on startup
 */
export function validateRequiredEnvVars( requiredVars: string[] ): void {
	const missing: string[] = [];

	for ( const varName of requiredVars ) {
		if ( !process.env[varName] ) {
			missing.push( varName );
		}
	}

	if ( missing.length > 0 ) {
		// eslint-disable-next-line no-console
		console.error( `Missing required environment variables: ${ missing.join( ", " ) }` );
		process.exit( 1 );
	}
}
