/**
 * Security utilities for error handling and message sanitization
 */

export interface ErrorResponse {
	error: string;
	message?: string;
	code?: number;
}

/**
 * Sanitize error messages for production to prevent information leakage
 */
export function sanitizeError( error: unknown, defaultMessage = "Internal server error" ): ErrorResponse {
	const isProduction = process.env.NODE_ENV === "production";

	if ( error instanceof Error ) {
		// In development, show detailed error messages
		// In production, use generic messages to prevent information leakage
		if ( !isProduction ) {
			return {
				error: "error",
				message: error.message,
				...( error.name && { code: getErrorCode( error.name ) } )
			};
		}

		// Only show safe error types in production
		if ( isSafeErrorType( error ) ) {
			return {
				error: "error",
				message: error.message
			};
		}
	}

	// Default response for production or unknown errors
	return {
		error: "internal_error",
		message: defaultMessage
	};
}

/**
 * Determine if an error type is safe to expose in production
 */
function isSafeErrorType( error: Error ): boolean {
	const safeErrorTypes = [
		"ValidationError",
		"AuthenticationError",
		"AuthorizationError",
		"BadRequestError",
		"NotFoundError",
		"ConflictError"
	];

	return safeErrorTypes.includes( error.name );
}

/**
 * Map error names to HTTP status codes
 */
function getErrorCode( errorName: string ): number {
	const errorCodes: Record<string, number> = {
		ValidationError: 400,
		BadRequestError: 400,
		AuthenticationError: 401,
		AuthorizationError: 403,
		NotFoundError: 404,
		ConflictError: 409,
		InternalError: 500
	};

	return errorCodes[errorName] || 500;
}

/**
 * Custom error classes for better error handling
 */
export class ValidationError extends Error {
	constructor( message: string ) {
		super( message );
		this.name = "ValidationError";
	}
}

export class AuthenticationError extends Error {
	constructor( message: string ) {
		super( message );
		this.name = "AuthenticationError";
	}
}

export class AuthorizationError extends Error {
	constructor( message: string ) {
		super( message );
		this.name = "AuthorizationError";
	}
}

export class NotFoundError extends Error {
	constructor( message: string ) {
		super( message );
		this.name = "NotFoundError";
	}
}

/**
 * Log errors securely (avoiding sensitive data in logs)
 */
export function logError( logger: any, error: unknown, context?: Record<string, unknown> ) {
	if ( error instanceof Error ) {
		logger.error( {
			name: error.name,
			message: error.message,
			stack: process.env.NODE_ENV !== "production" ? error.stack : undefined,
			...context
		}, "Application error occurred" );
	} else {
		logger.error( {
			error: String( error ),
			...context
		}, "Unknown error occurred" );
	}
}
