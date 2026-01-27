/**
 * @apps/shared - Input Validation Utilities
 *
 * Implements thorough input validation using positive (allow-list) validation
 * approaches for expected format, length, and type per IOH-IV-01 requirements.
 */

import { z } from "zod";
import type { Request, Response, NextFunction } from "express";

// =============================================================================
// VALIDATION CONSTANTS
// =============================================================================

/** Maximum allowed pagination offset to prevent DoS via large offsets */
export const MAX_PAGINATION_OFFSET = 100000;

/** Maximum allowed pagination limit to prevent memory exhaustion */
export const MAX_PAGINATION_LIMIT = 1000;

/** Default pagination limit when not specified */
export const DEFAULT_PAGINATION_LIMIT = 100;

/** Maximum length for account IDs */
export const MAX_ACCOUNT_ID_LENGTH = 50;

/** Maximum length for statement IDs */
export const MAX_STATEMENT_ID_LENGTH = 50;

/** Maximum length for interaction UIDs */
export const MAX_INTERACTION_UID_LENGTH = 100;

/** Maximum length for email addresses */
export const MAX_EMAIL_LENGTH = 254;

/** Maximum length for passwords */
export const MAX_PASSWORD_LENGTH = 128;

/** Minimum length for passwords */
export const MIN_PASSWORD_LENGTH = 1;

/** Maximum reasonable date range in years for queries */
export const MAX_DATE_RANGE_YEARS = 10;

// =============================================================================
// PAGINATION SCHEMAS
// =============================================================================

/**
 * Schema for pagination query parameters with bounds checking.
 * Uses positive validation with explicit min/max constraints.
 */
export const paginationSchema = z.object( {
	offset: z
		.string()
		.optional()
		.transform( ( val ) => {
			if ( !val ) return 0;
			const num = parseInt( val, 10 );
			if ( isNaN( num ) || num < 0 ) return 0;
			return Math.min( num, MAX_PAGINATION_OFFSET );
		} ),
	limit: z
		.string()
		.optional()
		.transform( ( val ) => {
			if ( !val ) return DEFAULT_PAGINATION_LIMIT;
			const num = parseInt( val, 10 );
			if ( isNaN( num ) || num < 1 ) return DEFAULT_PAGINATION_LIMIT;
			return Math.min( num, MAX_PAGINATION_LIMIT );
		} )
} );

export type PaginationParams = z.infer<typeof paginationSchema>;

// =============================================================================
// ACCOUNT ID SCHEMAS
// =============================================================================

/**
 * Allow-list pattern for account IDs.
 * Accepts: UUID format OR account-{number} format
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCOUNT_ID_PATTERN = /^account-[0-9]+$/;

/**
 * Schema for validating account IDs using allow-list approach.
 * Accepts UUID or account-{number} format with length constraints.
 */
export const accountIdSchema = z
	.string()
	.min( 1, "Account ID is required" )
	.max( MAX_ACCOUNT_ID_LENGTH, `Account ID must not exceed ${ MAX_ACCOUNT_ID_LENGTH } characters` )
	.refine(
		( val ) => UUID_PATTERN.test( val ) || ACCOUNT_ID_PATTERN.test( val ),
		{ message: "Account ID must be a valid UUID or match pattern 'account-{number}'" }
	);

/**
 * Schema for validating statement IDs using allow-list approach.
 */
export const statementIdSchema = z
	.string()
	.min( 1, "Statement ID is required" )
	.max( MAX_STATEMENT_ID_LENGTH, `Statement ID must not exceed ${ MAX_STATEMENT_ID_LENGTH } characters` )
	.refine(
		( val ) => UUID_PATTERN.test( val ) || /^stmt-[0-9]+$/.test( val ),
		{ message: "Statement ID must be a valid UUID or match pattern 'stmt-{number}'" }
	);

/**
 * Schema for validating interaction UIDs (from oidc-provider).
 * Allow-list: alphanumeric with hyphens and underscores.
 */
export const interactionUidSchema = z
	.string()
	.min( 1, "Interaction UID is required" )
	.max( MAX_INTERACTION_UID_LENGTH, `Interaction UID must not exceed ${ MAX_INTERACTION_UID_LENGTH } characters` )
	.regex( /^[a-zA-Z0-9_-]+$/, "Interaction UID contains invalid characters" );

// =============================================================================
// DATE SCHEMAS
// =============================================================================

/**
 * Schema for ISO 8601 date strings with reasonable range validation.
 */
export const dateStringSchema = z
	.string()
	.refine(
		( val ) => {
			const date = new Date( val );
			return !isNaN( date.getTime() );
		},
		{ message: "Invalid date format. Use ISO 8601 format (e.g., 2024-01-15T00:00:00Z)" }
	)
	.refine(
		( val ) => {
			const date = new Date( val );
			const now = new Date();
			const minDate = new Date( now.getFullYear() - MAX_DATE_RANGE_YEARS, 0, 1 );
			const maxDate = new Date( now.getFullYear() + 1, 11, 31 );
			return date >= minDate && date <= maxDate;
		},
		{ message: `Date must be within a reasonable range (within ${ MAX_DATE_RANGE_YEARS } years)` }
	);

/**
 * Schema for optional date range parameters.
 */
export const dateRangeSchema = z.object( {
	startTime: z.string().optional(),
	endTime: z.string().optional()
} ).refine(
	( data ) => {
		if ( !data.startTime && !data.endTime ) return true;
		if ( data.startTime && !isValidDateString( data.startTime ) ) return false;
		if ( data.endTime && !isValidDateString( data.endTime ) ) return false;
		if ( data.startTime && data.endTime ) {
			return new Date( data.startTime ) <= new Date( data.endTime );
		}
		return true;
	},
	{ message: "Invalid date range: startTime must be before or equal to endTime" }
);

/** Helper to validate date strings */
function isValidDateString( val: string ): boolean {
	const date = new Date( val );
	if ( isNaN( date.getTime() ) ) return false;
	const now = new Date();
	const minDate = new Date( now.getFullYear() - MAX_DATE_RANGE_YEARS, 0, 1 );
	const maxDate = new Date( now.getFullYear() + 1, 11, 31 );
	return date >= minDate && date <= maxDate;
}

// =============================================================================
// AUTHENTICATION SCHEMAS
// =============================================================================

/**
 * Schema for email validation using allow-list approach.
 * Based on RFC 5322 simplified pattern with length constraints.
 */
export const emailSchema = z
	.string()
	.min( 1, "Email is required" )
	.max( MAX_EMAIL_LENGTH, `Email must not exceed ${ MAX_EMAIL_LENGTH } characters` )
	.email( "Invalid email format" )
	.transform( ( val ) => val.toLowerCase().trim() );

/**
 * Schema for password validation with length constraints.
 * Note: Actual password strength validation should be done at registration.
 */
export const passwordSchema = z
	.string()
	.min( MIN_PASSWORD_LENGTH, `Password must be at least ${ MIN_PASSWORD_LENGTH } character` )
	.max( MAX_PASSWORD_LENGTH, `Password must not exceed ${ MAX_PASSWORD_LENGTH } characters` );

/**
 * Schema for login request body.
 */
export const loginSchema = z.object( {
	email: emailSchema,
	password: passwordSchema
} );

export type LoginInput = z.infer<typeof loginSchema>;

// =============================================================================
// API ENDPOINT ALLOW-LIST
// =============================================================================

/**
 * Allow-list of valid API endpoints for the API Explorer.
 * Uses pattern matching to support parameterized routes.
 */
export const ALLOWED_API_ENDPOINTS: RegExp[] = [
	/^\/api\/fdx\/v6\/customers\/current$/,
	/^\/api\/fdx\/v6\/accounts$/,
	/^\/api\/fdx\/v6\/accounts\/[a-zA-Z0-9_-]+$/,
	/^\/api\/fdx\/v6\/accounts\/[a-zA-Z0-9_-]+\/contact$/,
	/^\/api\/fdx\/v6\/accounts\/[a-zA-Z0-9_-]+\/statements$/,
	/^\/api\/fdx\/v6\/accounts\/[a-zA-Z0-9_-]+\/statements\/[a-zA-Z0-9_-]+$/,
	/^\/api\/fdx\/v6\/accounts\/[a-zA-Z0-9_-]+\/transactions$/,
	/^\/api\/fdx\/v6\/accounts\/[a-zA-Z0-9_-]+\/payment-networks$/,
	/^\/api\/fdx\/v6\/accounts\/[a-zA-Z0-9_-]+\/asset-transfer-networks$/
];

/**
 * Allow-list of valid HTTP methods for the API Explorer.
 */
export const ALLOWED_HTTP_METHODS = [ "GET", "HEAD", "OPTIONS" ] as const;

export type AllowedHttpMethod = typeof ALLOWED_HTTP_METHODS[number];

/**
 * Schema for API call requests from the API Explorer.
 */
export const apiCallSchema = z.object( {
	endpoint: z
		.string()
		.min( 1, "Endpoint is required" )
		.max( 500, "Endpoint too long" )
		.refine(
			( val ) => {
				// Normalize the endpoint (remove query strings and fragments)
				const cleanEndpoint = val.split( "?" )[0].split( "#" )[0];
				return ALLOWED_API_ENDPOINTS.some( ( pattern ) => pattern.test( cleanEndpoint ) );
			},
			{ message: "Endpoint not in allow-list of valid API endpoints" }
		),
	method: z
		.string()
		.optional()
		.transform( ( val ) => val?.toUpperCase() || "GET" )
		.refine(
			( val ): val is AllowedHttpMethod => ALLOWED_HTTP_METHODS.includes( val as AllowedHttpMethod ),
			{ message: `HTTP method must be one of: ${ ALLOWED_HTTP_METHODS.join( ", " ) }` }
		)
} );

export type ApiCallInput = z.infer<typeof apiCallSchema>;

// =============================================================================
// CONFIGURATION SCHEMAS
// =============================================================================

/**
 * Schema for OIDC client configuration with allow-list validation.
 */
export const oidcClientSchema = z.object( {
	client_id: z.string().min( 1 ).max( 100 ),
	client_secret: z.string().min( 1 ).max( 500 ),
	redirect_uris: z.array( z.string().url() ).min( 1 ),
	post_logout_redirect_uris: z.array( z.string().url() ).optional(),
	grant_types: z.array(
		z.enum( [ "authorization_code", "refresh_token", "client_credentials" ] )
	),
	response_types: z.array( z.enum( [ "code", "token", "id_token" ] ) ),
	token_endpoint_auth_method: z.enum( [
		"client_secret_basic",
		"client_secret_post",
		"none"
	] ).optional()
} );

export const oidcClientsSchema = z.array( oidcClientSchema );

export type OIDCClientConfig = z.infer<typeof oidcClientSchema>;

/**
 * Schema for JWKS (JSON Web Key Set) configuration.
 * Validates structure according to RFC 7517.
 */
export const jwkSchema = z.object( {
	kty: z.enum( [ "RSA", "EC", "OKP", "oct" ] ),
	use: z.enum( [ "sig", "enc" ] ).optional(),
	key_ops: z.array( z.string() ).optional(),
	alg: z.string().optional(),
	kid: z.string().optional(),
	// RSA specific
	n: z.string().optional(),
	e: z.string().optional(),
	d: z.string().optional(),
	p: z.string().optional(),
	q: z.string().optional(),
	dp: z.string().optional(),
	dq: z.string().optional(),
	qi: z.string().optional(),
	// EC specific
	crv: z.string().optional(),
	x: z.string().optional(),
	y: z.string().optional()
} );

export const jwksSchema = z.object( {
	keys: z.array( jwkSchema ).min( 1, "JWKS must contain at least one key" )
} );

export type JWKSConfig = z.infer<typeof jwksSchema>;

// =============================================================================
// JSON PARSING UTILITIES
// =============================================================================

/**
 * Safely parse JSON with validation schema.
 * Returns result object with success flag, data, or error.
 */
export function safeJsonParse<T>(
	jsonString: string,
	schema: z.ZodType<T>
): { success: true; data: T } | { success: false; error: string } {
	try {
		const parsed = JSON.parse( jsonString );
		const result = schema.safeParse( parsed );
		if ( result.success ) {
			return { success: true, data: result.data };
		}
		return { success: false, error: formatZodError( result.error ) };
	} catch ( e ) {
		return {
			success: false,
			error: e instanceof Error ? `JSON parse error: ${ e.message }` : "Invalid JSON"
		};
	}
}

/**
 * Format Zod validation errors into a readable string.
 * Compatible with Zod v4 which uses `issues` instead of `errors`.
 */
export function formatZodError( error: z.ZodError ): string {
	return error.issues
		.map( ( issue ) => `${ issue.path.join( "." ) }: ${ issue.message }` )
		.join( "; " );
}

// =============================================================================
// EXPRESS MIDDLEWARE FACTORIES
// =============================================================================

/**
 * Create Express middleware for validating request body against a schema.
 */
export function validateBody<T>( schema: z.ZodType<T> ) {
	return ( req: Request, res: Response, next: NextFunction ): void => {
		const result = schema.safeParse( req.body );
		if ( !result.success ) {
			res.status( 400 ).json( {
				error: "Validation failed",
				details: formatZodError( result.error )
			} );
			return;
		}
		req.body = result.data;
		next();
	};
}

/**
 * Create Express middleware for validating request query parameters.
 */
export function validateQuery<T>( schema: z.ZodType<T> ) {
	return ( req: Request, res: Response, next: NextFunction ): void => {
		const result = schema.safeParse( req.query );
		if ( !result.success ) {
			res.status( 400 ).json( {
				error: "Validation failed",
				details: formatZodError( result.error )
			} );
			return;
		}
		( req as Request & { validatedQuery: T } ).validatedQuery = result.data;
		next();
	};
}

/**
 * Create Express middleware for validating request path parameters.
 */
export function validateParams<T>( schema: z.ZodType<T> ) {
	return ( req: Request, res: Response, next: NextFunction ): void => {
		const result = schema.safeParse( req.params );
		if ( !result.success ) {
			res.status( 400 ).json( {
				error: "Validation failed",
				details: formatZodError( result.error )
			} );
			return;
		}
		( req as Request & { validatedParams: T } ).validatedParams = result.data;
		next();
	};
}

// =============================================================================
// SANITIZATION UTILITIES
// =============================================================================

/**
 * Sanitize string for safe logging (remove newlines, control characters).
 * Accepts string or string[] to handle Express req.params union types.
 */
export function sanitizeForLogging( input: string | string[], maxLength = 200 ): string {
	const str = Array.isArray( input ) ? input[0] ?? "" : input;
	return str
		// eslint-disable-next-line no-control-regex
		.replace( /[\x00-\x1F\x7F]/g, "" ) // Remove control characters
		.replace( /[\r\n]/g, " " ) // Replace newlines with spaces
		.slice( 0, maxLength );
}

/**
 * Escape HTML entities to prevent XSS in error messages.
 */
export function escapeHtml( input: string ): string {
	const htmlEntities: Record<string, string> = {
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		"\"": "&quot;",
		"'": "&#x27;",
		"/": "&#x2F;"
	};
	return input.replace( /[&<>"'/]/g, ( char ) => htmlEntities[char] || char );
}

// =============================================================================
// TOKEN SCHEMAS
// =============================================================================

/**
 * Schema for token cookie content (after JSON parsing).
 */
export const tokenSetSchema = z.object( {
	access_token: z.string().min( 1 ),
	token_type: z.string().optional(),
	id_token: z.string().optional(),
	refresh_token: z.string().optional(),
	expires_at: z.number().optional(),
	scope: z.string().optional()
} );

export type TokenSetInput = z.infer<typeof tokenSetSchema>;

// =============================================================================
// COMBINED SCHEMAS FOR ROUTES
// =============================================================================

/**
 * Schema for account endpoints with pagination.
 */
export const accountsQuerySchema = paginationSchema;

/**
 * Schema for statements/transactions endpoints with date range and pagination.
 */
export const dateRangePaginationSchema = z.object( {
	offset: paginationSchema.shape.offset,
	limit: paginationSchema.shape.limit,
	startTime: z.string().optional(),
	endTime: z.string().optional()
} ).refine(
	( data ) => {
		if ( !data.startTime && !data.endTime ) return true;
		if ( data.startTime && !isValidDateString( data.startTime ) ) return false;
		if ( data.endTime && !isValidDateString( data.endTime ) ) return false;
		if ( data.startTime && data.endTime ) {
			return new Date( data.startTime ) <= new Date( data.endTime );
		}
		return true;
	},
	{ message: "Invalid date range: dates must be valid and startTime must be before or equal to endTime" }
);

export type DateRangePaginationParams = z.infer<typeof dateRangePaginationSchema>;

/**
 * Schema for account path parameter.
 */
export const accountParamsSchema = z.object( {
	accountId: accountIdSchema
} );

/**
 * Schema for statement path parameters.
 */
export const statementParamsSchema = z.object( {
	accountId: accountIdSchema,
	statementId: statementIdSchema
} );

/**
 * Schema for interaction path parameter.
 */
export const interactionParamsSchema = z.object( {
	uid: interactionUidSchema
} );
