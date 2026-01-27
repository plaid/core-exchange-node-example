import "dotenv/config";
import express, { Request, Response } from "express";
import { Provider, errors } from "oidc-provider";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import {
	logError,
	getRequiredEnv,
	getRequiredEnvNumber,
	createLogger,
	createWebSecurityHeaders,
	setupBasicExpress,
	setupEJSTemplates
} from "@apps/shared";
import {
	loginSchema,
	interactionUidSchema,
	oidcClientsSchema,
	jwksSchema,
	safeJsonParse,
	sanitizeForLogging,
	formatZodError,
	type OIDCClientConfig as BaseOIDCClientConfig
} from "@apps/shared/validation";
import { timingSafeEqual } from "crypto";

// Create logger for OP service
// Debug logging can be enabled by setting LOG_LEVEL=debug in your .env file
// This will log detailed information about:
// - OAuth authorization requests (client_id, redirect_uri, scopes, state)
// - Login attempts (email, success/failure)
// - Consent flow (grants, scopes, claims)
// - Token issuance decisions (refresh tokens, access tokens)
// - Account lookups and claim retrieval
const logger = createLogger( "op" );

// Log the current log level on startup for debugging
logger.info( { logLevel: logger.level, envLogLevel: process.env.LOG_LEVEL }, "Logger initialized" );

// Environment configuration

const ISSUER = getRequiredEnv( "OP_ISSUER", "https://id.localtest.me" );
const PORT = getRequiredEnvNumber( "OP_PORT", 3001 );
const API_AUDIENCE = getRequiredEnv( "API_AUDIENCE", "api://my-api" );

// Load clients from environment variable, file, or defaults with schema validation
function loadOIDCClients() {
	let source: string;

	// 1. Try OIDC_CLIENTS env var (JSON string)
	if ( process.env.OIDC_CLIENTS ) {
		source = "OIDC_CLIENTS environment variable";
		logger.info( `Loading OIDC clients from ${ source }` );
		const parseResult = safeJsonParse( process.env.OIDC_CLIENTS, oidcClientsSchema );
		if ( !parseResult.success ) {
			logger.error( { error: parseResult.error }, `Invalid OIDC clients configuration from ${ source }` );
			throw new Error( `Invalid OIDC clients configuration: ${ parseResult.error }` );
		}
		return parseResult.data;
	}

	// 2. Try .env.clients.json file in app directory (for easier multi-client config)
	const clientsFilePath = resolve( new URL( "../", import.meta.url ).pathname, ".env.clients.json" );
	if ( existsSync( clientsFilePath ) ) {
		source = "apps/auth/.env.clients.json";
		logger.info( `Loading OIDC clients from ${ source }` );
		try {
			const fileContent = readFileSync( clientsFilePath, "utf-8" );
			const parseResult = safeJsonParse( fileContent, oidcClientsSchema );
			if ( !parseResult.success ) {
				logger.error( { error: parseResult.error }, `Invalid OIDC clients configuration from ${ source }` );
				throw new Error( `Invalid OIDC clients configuration: ${ parseResult.error }` );
			}
			return parseResult.data;
		} catch ( error ) {
			if ( error instanceof Error && error.message.includes( "Invalid OIDC clients" ) ) {
				throw error;
			}
			logger.error( { error }, `Failed to read OIDC clients file from ${ source }` );
			throw new Error( `Failed to read OIDC clients file: ${ error }` );
		}
	}

	// 3. Fall back to single client from env vars (no validation needed - simple defaults)
	logger.info( "Loading single OIDC client from CLIENT_ID/CLIENT_SECRET env vars" );
	const rawClients = [
		{
			client_id: getRequiredEnv( "CLIENT_ID", "dev-rp" ),
			client_secret: getRequiredEnv( "CLIENT_SECRET", "dev-secret" ),
			redirect_uris: [ getRequiredEnv( "REDIRECT_URI", "https://app.localtest.me/callback" ) ],
			post_logout_redirect_uris: [ "https://app.localtest.me" ],
			grant_types: [ "authorization_code", "refresh_token" ],
			response_types: [ "code" ],
			token_endpoint_auth_method: "client_secret_basic"
		}
	];

	// Validate even the default configuration
	const parseResult = oidcClientsSchema.safeParse( rawClients );
	if ( !parseResult.success ) {
		logger.error( { error: formatZodError( parseResult.error ) }, "Invalid default OIDC client configuration" );
		throw new Error( `Invalid default OIDC client configuration: ${ formatZodError( parseResult.error ) }` );
	}
	return parseResult.data;
}

const OIDC_CLIENTS = loadOIDCClients();
logger.info( `Loaded ${ OIDC_CLIENTS.length } OIDC client(s)` );

// Load JWKS (JSON Web Key Set) for token signing with schema validation
// If not provided, oidc-provider will generate ephemeral keys with kid "keystore-CHANGE-ME"
function loadJWKS() {
	const jwksEnv = process.env.JWKS;
	if ( !jwksEnv ) {
		logger.warn( "JWKS not configured - using oidc-provider default ephemeral keys" );
		logger.warn( "For production, set JWKS environment variable with your signing keys" );
		logger.warn( "Generate keys with: node scripts/secrets.js jwks" );
		return undefined;
	}

	const parseResult = safeJsonParse( jwksEnv, jwksSchema );
	if ( !parseResult.success ) {
		logger.error( { error: parseResult.error }, "Invalid JWKS configuration" );
		throw new Error( `Invalid JWKS configuration: ${ parseResult.error }` );
	}

	logger.info( `Loaded JWKS with ${ parseResult.data.keys.length } key(s)` );
	return parseResult.data;
}

const JWKS = loadJWKS();

// Extend the validated client config type with optional force_refresh_token flag
interface OIDCClientConfig extends BaseOIDCClientConfig {
	force_refresh_token?: boolean;
}

// Extract per-client force refresh flag and provide sanitized client metadata to oidc-provider
const FORCE_REFRESH_CLIENT_ID_SET = new Set<string>(
	OIDC_CLIENTS
		.filter( ( c: OIDCClientConfig ) => Boolean( c.force_refresh_token ) )
		.map( ( c: OIDCClientConfig ) => String( c.client_id ) )
);

const SANITIZED_CLIENTS = OIDC_CLIENTS.map( ( c: OIDCClientConfig ) => {
	// Remove internal flags not recognized by oidc-provider
	// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
	const { force_refresh_token, ...rest } = c;
	return rest;
} );

const app = express();
setupBasicExpress( app );

// Security headers
app.use( createWebSecurityHeaders() );

// Body parsers (needed to log token request parameters)
app.use( express.urlencoded( { extended: false } ) );
app.use( express.json() );

// Template engine
setupEJSTemplates( app, new URL( "../views", import.meta.url ).pathname );

// Serve static files (CSS, etc.)
app.use( "/public", express.static( new URL( "../public", import.meta.url ).pathname ) );

// Very minimal in-memory user store
const USERS = new Map<
	string,
	{ id: string; email: string; password: string; name: string; oauthAuthorized: boolean }
>( [
	[
		"user@example.test",
		{
			id: "user_123",
			email: "user@example.test",
			password: "passw0rd!",
			name: "Dev User",
			oauthAuthorized: true
		}
	],
	[
		"blocked@example.test",
		{
			id: "user_456",
			email: "blocked@example.test",
			password: "passw0rd!",
			name: "Blocked User",
			oauthAuthorized: false
		}
	]
] );

/**
 * Timing-safe password comparison to prevent timing attacks.
 * Always compares full strings even if they differ in length.
 */
function secureComparePasswords( provided: string, stored: string ): boolean {
	// Pad to same length to prevent length-based timing leaks
	const maxLength = Math.max( provided.length, stored.length );
	const paddedProvided = provided.padEnd( maxLength, "\0" );
	const paddedStored = stored.padEnd( maxLength, "\0" );

	try {
		return timingSafeEqual(
			Buffer.from( paddedProvided, "utf8" ),
			Buffer.from( paddedStored, "utf8" )
		) && provided.length === stored.length;
	} catch {
		return false;
	}
}

/**
 * Validate interaction UID path parameter.
 * Accepts string or string[] to handle Express req.params union types.
 */
function validateInteractionUid( uid: string | string[] ): { success: true; data: string } | { success: false; error: string } {
	const uidStr = Array.isArray( uid ) ? uid[0] ?? "" : uid;
	const result = interactionUidSchema.safeParse( uidStr );
	if ( !result.success ) {
		return { success: false, error: formatZodError( result.error ) };
	}
	return { success: true, data: result.data };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const configuration: any = {
	clients: SANITIZED_CLIENTS,
	// Use custom JWKS if provided, otherwise oidc-provider generates ephemeral keys
	...( JWKS ? { jwks: JWKS } : {} ),
	claims: {
		openid: [ "sub" ],
		profile: [ "name" ],
		email: [ "email" ],
		offline_access: []
	},
	scopes: [ "openid", "profile", "email", "offline_access", "accounts:read" ],
	pkce: { methods: [ "S256" ], required: () => false },
	ttl: {
		Session: 24 * 60 * 60,        // 1 day
		Grant: 365 * 24 * 60 * 60,    // 1 year
		AccessToken: 60 * 60,          // 1 hour
		IdToken: 60 * 60,              // 1 hour
		RefreshToken: 14 * 24 * 60 * 60 // 14 days
	},
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	issueRefreshToken: async ( _ctx: unknown, client: any, code: any ) => {
		// Issue refresh token if client supports refresh_token grant and either:
		// - offline_access scope is requested (standard behavior), or
		// - client has force_refresh_token flag set in .env.clients.json
		const clientId = client.clientId || client.client_id;
		const grantTypeAllowed = client.grantTypeAllowed( "refresh_token" );

		if ( !grantTypeAllowed ) {
			logger.debug( { clientId }, "issueRefreshToken - Client does not support refresh_token grant type" );
			return false;
		}

		const requestedOfflineAccess = code.scopes.has( "offline_access" );
		const isForceEnabled = FORCE_REFRESH_CLIENT_ID_SET.has( String( clientId ) );
		const willIssue = requestedOfflineAccess || isForceEnabled;

		logger.debug( {
			clientId,
			requestedOfflineAccess,
			isForceEnabled,
			willIssueRefreshToken: willIssue,
			scopes: Array.from( code.scopes )
		}, "issueRefreshToken - Refresh token decision" );

		return willIssue;
	},
	features: {
		devInteractions: { enabled: false }, // we provide our own interactions
		rpInitiatedLogout: {
			enabled: true,
			logoutSource: async ( _ctx: unknown, form: string ) => {
				// Auto-submit immediately without showing any page
				return `<!DOCTYPE html>
				<html>
				<head>
					<title>Logging out...</title>
					<script>
						document.addEventListener('DOMContentLoaded', function() {
							document.forms[0].submit();
						});
					</script>
				</head>
				<body style="display:none;">
					${ form }
				</body>
				</html>`;
			}
		},
		resourceIndicators: {
			// RFC 8707 - Resource Indicators for OAuth 2.0
			// This feature is REQUIRED to issue JWT access tokens in oidc-provider v7+
			// Without this, all access tokens will be opaque (random strings)
			enabled: true,

			// defaultResource: Called during authorization when client doesn't provide resource parameter
			// Returns the default resource indicator (audience) for the access token
			// Must be an absolute URI without fragment (e.g., "https://api.example.com" or "api://my-api")
			defaultResource: () => API_AUDIENCE,

			// getResourceServerInfo: CRITICAL - This determines the access token format
			// Called whenever a resource indicator needs to be validated/configured
			// The returned object MUST include accessTokenFormat to get JWT tokens
			//
			// Parameters:
			//   - ctx: OIDC context (contains request info, client, params)
			//   - resourceIndicator: The resource URI (e.g., "api://my-api")
			//   - client: The OIDC client making the request
			//
			// Returns ResourceServerInfo object with:
			//   - scope: Space-separated allowed scopes for this resource
			//   - audience: The aud claim value in the JWT (usually same as resourceIndicator)
			//   - accessTokenFormat: "jwt" | "opaque" | "paseto" - MUST be "jwt" for JWT tokens
			//   - accessTokenTTL: Token lifetime in seconds
			//   - jwt: (optional) { sign, encrypt } algorithms for additional JWT customization
			getResourceServerInfo: async ( _ctx: unknown, resourceIndicator: unknown, client: unknown ) => {
				logger.debug( {
					resourceIndicator,
					clientId: ( client as { clientId?: string } )?.clientId
				}, "getResourceServerInfo called" );

				const config = {
					scope: "openid profile email offline_access accounts:read",
					audience: API_AUDIENCE,
					accessTokenFormat: "jwt" as const,  // CRITICAL: Must be "jwt" to issue JWT tokens
					accessTokenTTL: 60 * 60  // 1 hour
				};

				logger.debug( { config }, "getResourceServerInfo returning config" );
				return config;
			},

			// useGrantedResource: Controls whether to reuse resource from original authorization
			// When true: Token/refresh requests can omit resource parameter and use stored value
			// When false: Every token request MUST include resource parameter
			//
			// IMPORTANT: Even with this set to true, the client SHOULD send the resource
			// parameter in token exchange requests for RFC 8707 compliance and to avoid
			// edge cases with openid scope + userinfo endpoint (which defaults to opaque tokens)
			useGrantedResource: async () => true
		}
	},
	// Adapter TODO: move to Postgres adapter for persistence in real testing
	// See oidc-provider docs for Adapter interface
	findAccount: async ( _ctx: unknown, sub: string ) => {
		logger.debug( { sub }, "findAccount - Looking up account" );
		return {
			accountId: sub,
			async claims() {
				// naive mapping: sub is the user id
				for ( const [ , u ] of USERS ) {
					if ( u.id === sub ) {
						logger.debug( { sub, email: u.email, name: u.name }, "findAccount - Claims retrieved" );
						return { sub, email: u.email, name: u.name };
					}
				}
				logger.debug( { sub }, "findAccount - No user found, returning minimal claims" );
				return { sub };
			}
		};
	},
	interactions: {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		url: ( _ctx: unknown, interaction: any ) => `/interaction/${ interaction.uid }`
	}
};

/**
 * Helper function to redirect back to the client with an OAuth error
 * @param redirectUri - The client's redirect URI
 * @param state - The state parameter from the original request
 * @param errorCode - OAuth error code (invalid_request, invalid_client, etc.)
 * @param errorDescription - Human-readable error description
 */
function redirectWithOAuthError(
	res: Response,
	redirectUri: string,
	state: string | undefined,
	errorCode: string,
	errorDescription?: string
) {
	const url = new URL( redirectUri );
	url.searchParams.append( "error", errorCode );
	if ( errorDescription ) {
		url.searchParams.append( "error_description", errorDescription );
	}
	if ( state ) {
		url.searchParams.append( "state", state );
	}

	logger.info( {
		redirectUri,
		errorCode,
		errorDescription,
		state
	}, "Redirecting to client with OAuth error" );

	res.redirect( 303, url.toString() );
}

/**
 * Determines the appropriate OAuth error code based on the error type
 */
function mapErrorToOAuthCode( error: unknown ): { code: string; description: string } {
	const errorMessage = error instanceof Error ? error.message : String( error );
	const lowerMessage = errorMessage.toLowerCase();

	// Map common error patterns to OAuth error codes
	if ( lowerMessage.includes( "missing" ) || lowerMessage.includes( "required" ) ) {
		return { code: "invalid_request", description: "The request is missing a required parameter." };
	}
	if ( lowerMessage.includes( "client" ) && lowerMessage.includes( "auth" ) ) {
		return { code: "invalid_client", description: "Client authentication failed." };
	}
	if ( lowerMessage.includes( "grant" ) || lowerMessage.includes( "expired" ) || lowerMessage.includes( "revoked" ) ) {
		return { code: "invalid_grant", description: errorMessage };
	}
	if ( lowerMessage.includes( "unauthorized" ) ) {
		return { code: "unauthorized_client", description: "The authenticated client is not authorized to use this authorization grant type." };
	}
	if ( lowerMessage.includes( "grant type" ) || lowerMessage.includes( "unsupported" ) ) {
		return { code: "unsupported_grant_type", description: "The authorization grant type is not supported by the authorization server." };
	}
	if ( lowerMessage.includes( "scope" ) ) {
		return { code: "invalid_scope", description: "The requested scope is invalid, unknown, or malformed." };
	}

	// Default to invalid_request for unclassified errors
	return { code: "invalid_request", description: errorMessage };
}

async function main() {
	const provider = new Provider( ISSUER, configuration );
	// Trust reverse proxy headers (e.g., x-forwarded-proto from Caddy)
	provider.proxy = true;

	// Interactions (login + consent) in-process for simplicity
	app.get( "/interaction/:uid", async ( req: Request, res: Response ) => {
		try {
			// Validate interaction UID path parameter
			const uidResult = validateInteractionUid( req.params.uid );
			if ( !uidResult.success ) {
				logger.warn( { rawUid: sanitizeForLogging( req.params.uid ), error: uidResult.error }, "GET /interaction/:uid - Invalid UID format" );
				return res.status( 400 ).send( "Invalid interaction identifier" );
			}
			const uid = uidResult.data;
			logger.debug( { uid, query: req.query, cookies: req.cookies }, "GET /interaction/:uid - Request received" );

			const details = await provider.interactionDetails( req, res );
			const prompt = details.prompt.name; // "login" or "consent"

			// Parse requested scopes for display
			const requestedScopes = String( details.params.scope || "" )
				.split( " " )
				.filter( Boolean );

			logger.debug( {
				uid,
				prompt,
				requestedScopes,
				clientId: details.params.client_id,
				redirectUri: details.params.redirect_uri,
				responseType: details.params.response_type,
				state: details.params.state,
				session: details.session
			}, "GET /interaction/:uid - Interaction details loaded" );

			res.render( "interaction", {
				uid,
				prompt,
				scopes: requestedScopes,
				error: undefined,
				email: undefined
			} );
		} catch ( error ) {
			logError( logger, error, { context: "GET /interaction/:uid" } );

			// Try to get interaction details to extract redirect_uri and state
			try {
				const details = await provider.interactionDetails( req, res );
				const redirectUri = details.params.redirect_uri as string;
				const state = details.params.state as string | undefined;

				const { code, description } = mapErrorToOAuthCode( error );
				return redirectWithOAuthError( res, redirectUri, state, code, description );
			} catch ( detailsError ) {
				// If we can't get interaction details, return a generic error page
				logError( logger, detailsError, { context: "GET /interaction/:uid - Failed to get interaction details" } );
				return res.status( 400 ).send( "Invalid or expired interaction" );
			}
		}
	} );

	app.post(
		"/interaction/:uid/login",
		express.urlencoded( { extended: false } ),
		async ( req: Request, res: Response ) => {
			try {
				// Validate interaction UID path parameter
				const uidResult = validateInteractionUid( req.params.uid );
				if ( !uidResult.success ) {
					logger.warn( { rawUid: sanitizeForLogging( req.params.uid ), error: uidResult.error }, "POST /interaction/:uid/login - Invalid UID format" );
					return res.status( 400 ).send( "Invalid interaction identifier" );
				}
				const uid = uidResult.data;

				// Validate login input using schema with length and format checks
				const loginResult = loginSchema.safeParse( req.body );
				if ( !loginResult.success ) {
					logger.debug( { uid, error: formatZodError( loginResult.error ) }, "POST /interaction/:uid/login - Input validation failed" );

					// Get interaction details to extract scopes for re-rendering
					const details = await provider.interactionDetails( req, res );
					const requestedScopes = String( details.params.scope || "" )
						.split( " " )
						.filter( Boolean );

					// Re-render login form with validation error
					return res.render( "interaction", {
						uid,
						prompt: "login",
						scopes: requestedScopes,
						error: "Invalid email or password format.",
						email: String( req.body?.email || "" ).slice( 0, 254 )  // Preserve truncated email
					} );
				}

				const { email, password } = loginResult.data;

				logger.debug( {
					uid,
					email: sanitizeForLogging( email ),
					passwordProvided: !!password
				}, "POST /interaction/:uid/login - Login attempt" );

				const user = USERS.get( email );
				// Use timing-safe comparison to prevent timing attacks
				if ( !user || !secureComparePasswords( password, user.password ) ) {
					logger.debug( { uid, email: sanitizeForLogging( email ), userFound: !!user }, "POST /interaction/:uid/login - Authentication failed" );

					// Get interaction details to extract scopes for re-rendering
					const details = await provider.interactionDetails( req, res );
					const requestedScopes = String( details.params.scope || "" )
						.split( " " )
						.filter( Boolean );

					// Re-render login form with error message
					return res.render( "interaction", {
						uid,
						prompt: "login",
						scopes: requestedScopes,
						error: "Invalid email or password. Please try again.",
						email  // Preserve the email field
					} );
				}

				logger.debug( {
					uid,
					email,
					userId: user.id,
					oauthAuthorized: user.oauthAuthorized
				}, "POST /interaction/:uid/login - Authentication successful" );

				// Check if user is authorized for OAuth
				if ( !user.oauthAuthorized ) {
					logger.warn( {
						uid,
						email,
						userId: user.id
					}, "POST /interaction/:uid/login - User not authorized for OAuth" );

					// Get interaction details to redirect with error
					const details = await provider.interactionDetails( req, res );
					const redirectUri = details.params.redirect_uri as string;
					const state = details.params.state as string | undefined;

					return redirectWithOAuthError(
						res,
						redirectUri,
						state,
						"unauthorized_client",
						"This account is not authorized to connect via OAuth."
					);
				}

				const result = {
					login: { accountId: user.id }
					// You can remember the login with a cookie/session in a real app
				};

				logger.debug( {
					uid,
					result
				}, "POST /interaction/:uid/login - Submitting login result to provider" );

				const redirectTo = await provider.interactionResult( req, res, result, {
					mergeWithLastSubmission: false
				} );

				logger.debug( {
					uid,
					redirectTo
				}, "POST /interaction/:uid/login - Redirecting to next step" );

				return res.redirect( 303, redirectTo );
			} catch ( error ) {
				logError( logger, error, { context: "POST /interaction/:uid/login" } );

				// Try to get interaction details to redirect with error
				try {
					const details = await provider.interactionDetails( req, res );
					const redirectUri = details.params.redirect_uri as string;
					const state = details.params.state as string | undefined;

					const { code, description } = mapErrorToOAuthCode( error );
					return redirectWithOAuthError( res, redirectUri, state, code, description );
				} catch ( detailsError ) {
					// If we can't get interaction details, return a generic error
					logError( logger, detailsError, { context: "POST /interaction/:uid/login - Failed to get interaction details" } );
					return res.status( 400 ).send( "Invalid or expired interaction" );
				}
			}
		}
	);

	app.post(
		"/interaction/:uid/confirm",
		express.urlencoded( { extended: false } ),
		async ( req: Request, res: Response ) => {
			try {
				// Validate interaction UID path parameter
				const uidResult = validateInteractionUid( req.params.uid );
				if ( !uidResult.success ) {
					logger.warn( { rawUid: sanitizeForLogging( req.params.uid ), error: uidResult.error }, "POST /interaction/:uid/confirm - Invalid UID format" );
					return res.status( 400 ).send( "Invalid interaction identifier" );
				}
				const uid = uidResult.data;
				logger.debug( { uid }, "POST /interaction/:uid/confirm - Consent confirmation received" );

				const details = await provider.interactionDetails( req, res );
				const { grantId, prompt } = details;

				logger.debug( {
					uid,
					clientId: details.params.client_id,
					existingGrantId: grantId,
					accountId: details.session?.accountId,
					requestedScopes: details.params.scope
				}, "POST /interaction/:uid/confirm - Processing consent" );

				// Reuse existing grant or create a new one
				const grant = grantId
					? await provider.Grant.find( grantId )
					: new provider.Grant( {
						accountId: details.session!.accountId!,
						clientId: details.params.client_id as string
					} );

				logger.debug( {
					uid,
					grantMode: grantId ? "existing" : "new"
				}, "POST /interaction/:uid/confirm - Grant initialized" );

				// Always include originally requested scopes from the authorization request
				const requestedScopes = String( details.params.scope || "" ).trim();
				if ( requestedScopes ) {
					grant.addOIDCScope( requestedScopes );
					logger.debug( { uid, requestedScopes }, "POST /interaction/:uid/confirm - Added OIDC scopes from params" );
				}

				// Grant exactly what is being requested by this prompt
				const promptDetails = prompt.details as Record<string, unknown> | undefined;
				const missingOIDCScopes = promptDetails?.missingOIDCScopes as
	        | string[]
	        | undefined;
				if ( missingOIDCScopes && missingOIDCScopes.length > 0 ) {
					grant.addOIDCScope( missingOIDCScopes.join( " " ) );
					logger.debug( { uid, missingOIDCScopes }, "POST /interaction/:uid/confirm - Added missing OIDC scopes" );
				}

				const missingOIDCClaims = promptDetails?.missingOIDCClaims as
	        | Record<string, unknown>
	        | undefined;
				if ( missingOIDCClaims && Object.keys( missingOIDCClaims ).length > 0 ) {
					grant.addOIDCClaims( Object.keys( missingOIDCClaims ) );
					logger.debug( { uid, missingOIDCClaims: Object.keys( missingOIDCClaims ) }, "POST /interaction/:uid/confirm - Added missing OIDC claims" );
				}

				const missingResourceScopes = promptDetails?.missingResourceScopes as
					| Record<string, string[]>
					| undefined;
				if ( missingResourceScopes ) {
					for ( const [ resourceIndicator, scopes ] of Object.entries(
						missingResourceScopes
					) ) {
						if ( scopes.length > 0 ) {
							grant.addResourceScope( resourceIndicator, scopes.join( " " ) );
							logger.debug( { uid, resourceIndicator, scopes }, "POST /interaction/:uid/confirm - Added resource scopes" );
						}
					}
				}

				const finalGrantId = await grant.save();
				logger.debug( { uid, finalGrantId }, "POST /interaction/:uid/confirm - Grant saved" );

				const result = { consent: { grantId: finalGrantId } };

				logger.debug( {
					uid,
					result
				}, "POST /interaction/:uid/confirm - Submitting consent result to provider" );

				const redirectTo = await provider.interactionResult( req, res, result, {
					mergeWithLastSubmission: true
				} );

				logger.debug( {
					uid,
					redirectTo
				}, "POST /interaction/:uid/confirm - Redirecting to callback" );

				return res.redirect( 303, redirectTo );
			} catch ( error ) {
				logError( logger, error, { context: "POST /interaction/:uid/confirm" } );

				// Try to get interaction details to redirect with error
				try {
					const details = await provider.interactionDetails( req, res );
					const redirectUri = details.params.redirect_uri as string;
					const state = details.params.state as string | undefined;

					const { code, description } = mapErrorToOAuthCode( error );
					return redirectWithOAuthError( res, redirectUri, state, code, description );
				} catch ( detailsError ) {
					// If we can't get interaction details, return a generic error
					logError( logger, detailsError, { context: "POST /interaction/:uid/confirm - Failed to get interaction details" } );
					return res.status( 400 ).send( "Invalid or expired interaction" );
				}
			}
		}
	);

	app.post(
		"/interaction/:uid/cancel",
		express.urlencoded( { extended: false } ),
		async ( req: Request, res: Response ) => {
			// Validate interaction UID path parameter
			const uidResult = validateInteractionUid( req.params.uid );
			if ( !uidResult.success ) {
				logger.warn( { rawUid: sanitizeForLogging( req.params.uid ), error: uidResult.error }, "POST /interaction/:uid/cancel - Invalid UID format" );
				return res.status( 400 ).send( "Invalid interaction identifier" );
			}
			const uid = uidResult.data;
			logger.debug( { uid }, "POST /interaction/:uid/cancel - Consent cancelled" );

			const details = await provider.interactionDetails( req, res );
			const redirectUri = details.params.redirect_uri as string;
			const state = details.params.state as string | undefined;

			logger.debug( {
				uid,
				redirectUri,
				state,
				clientId: details.params.client_id
			}, "POST /interaction/:uid/cancel - Redirecting with access_denied error" );

			// Build the error redirect URL
			const url = new URL( redirectUri );
			url.searchParams.append( "error", "access_denied" );
			if ( state ) {
				url.searchParams.append( "state", state );
			}

			logger.debug( {
				uid,
				redirectTo: url.toString()
			}, "POST /interaction/:uid/cancel - Redirecting to client with error" );

			return res.redirect( 303, url.toString() );
		}
	);

	// Log all OIDC provider requests for debugging
	app.use( ( req: Request, res: Response, next ) => {
		// Log token endpoint requests (POST /token)
		if ( req.path === "/token" && req.method === "POST" ) {
			logger.debug( {
				method: req.method,
				path: req.path,
				grantType: req.body?.grant_type,
				clientId: req.body?.client_id,
				code: req.body?.code ? "present" : "missing",
				refreshToken: req.body?.refresh_token ? "present" : "missing"
			}, "POST /token - Token request received" );
		}

		// Log authorization endpoint requests (GET /auth)
		if ( req.path === "/auth" && req.method === "GET" ) {
			logger.debug( {
				method: req.method,
				path: req.path,
				clientId: req.query.client_id,
				redirectUri: req.query.redirect_uri,
				responseType: req.query.response_type,
				scope: req.query.scope,
				state: req.query.state
			}, "GET /auth - Authorization request received" );
		}

		// Intercept response to log token response
		const originalSend = res.send.bind( res );
		const originalEnd = res.end.bind( res );

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		res.send = function ( body: any ) {
			if ( req.path === "/token" && req.method === "POST" ) {
				try {
					const parsed = typeof body === "string" ? JSON.parse( body ) : body;
					logger.debug( {
						path: req.path,
						accessTokenIssued: !!parsed.access_token,
						idTokenIssued: !!parsed.id_token,
						refreshTokenIssued: !!parsed.refresh_token,
						tokenType: parsed.token_type,
						expiresIn: parsed.expires_in,
						scope: parsed.scope
					}, "POST /token - Token response sent (via send)" );
				} catch {
					logger.debug( { path: req.path }, "POST /token - Response sent (could not parse)" );
				}
			}
			return originalSend( body );
		};

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		res.end = function ( chunk?: any, ...args: any[] ) {
			if ( req.path === "/token" && req.method === "POST" && chunk ) {
				try {
					const parsed = typeof chunk === "string" ? JSON.parse( chunk ) : chunk;
					if ( parsed.access_token ) {
						// Count dots to determine JWT format (should have 2 dots = 3 parts)
						const accessTokenParts = parsed.access_token ? parsed.access_token.split( "." ).length : 0;
						const idTokenParts = parsed.id_token ? parsed.id_token.split( "." ).length : 0;
						const refreshTokenParts = parsed.refresh_token ? parsed.refresh_token.split( "." ).length : 0;

						logger.debug( {
							path: req.path,
							accessTokenIssued: !!parsed.access_token,
							accessTokenLength: parsed.access_token ? parsed.access_token.length : 0,
							accessTokenParts,
							accessTokenPrefix: parsed.access_token ? parsed.access_token.substring( 0, 20 ) : "",
							idTokenIssued: !!parsed.id_token,
							idTokenLength: parsed.id_token ? parsed.id_token.length : 0,
							idTokenParts,
							refreshTokenIssued: !!parsed.refresh_token,
							refreshTokenLength: parsed.refresh_token ? parsed.refresh_token.length : 0,
							refreshTokenParts,
							refreshTokenPrefix: parsed.refresh_token ? parsed.refresh_token.substring( 0, 20 ) : "",
							tokenType: parsed.token_type,
							expiresIn: parsed.expires_in,
							scope: parsed.scope
						}, "POST /token - Token response sent (via end)" );
					}
				} catch {
					// Ignore parsing errors
				}
			}
			return originalEnd( chunk, ...args );
		};

		next();
	} );

	// Hand off all other routes to oidc-provider
	app.use( ( req: Request, res: Response ) => {
		const callback = provider.callback();
		callback( req, res );
	} );

	app.listen( PORT, "0.0.0.0", () => {
		logger.info( `OP listening at ${ ISSUER } (local port: ${ PORT })` );
	} );
}

main().catch( ( e ) => {
	if ( e instanceof errors.OIDCProviderError ) {
		logError( logger, e, { context: "OIDC Provider startup" } );
	} else {
		logError( logger, e, { context: "Application startup" } );
	}
	process.exit( 1 );
} );
