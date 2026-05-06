import "dotenv/config";
import express, { Request, Response } from "express";
import cookieParser from "cookie-parser";
import * as client from "openid-client";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { webcrypto } from "crypto";
import {
	sanitizeError,
	logError,
	getRequiredEnv,
	getRequiredEnvNumber,
	createLogger,
	createWebSecurityHeaders,
	setupBasicExpress,
	setupEJSTemplates
} from "@apps/shared";
import {
	apiCallSchema,
	tokenSetSchema,
	safeJsonParse,
	escapeHtml,
	sanitizeForLogging,
	formatZodError
} from "@apps/shared/validation";

// Polyfill for crypto global in Node.js
if ( !globalThis.crypto ) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	globalThis.crypto = webcrypto as any;
}

// Create logger for APP service
const logger = createLogger( "app" );

// Type definitions
interface OidcState {
	state: string;
	code_verifier: string;
	nonce: string;
}

interface TokenSet {
	access_token: string;
	refresh_token?: string;
	id_token?: string;
}

interface CookieRequest extends Request {
	cookies: {
		[key: string]: string;
	};
	signedCookies: {
		[key: string]: string;
	};
}

const IS_PRODUCTION = process.env.NODE_ENV === "production";

const SIGNED_COOKIE_OPTIONS = {
	httpOnly: true,
	sameSite: "lax",
	secure: true,
	signed: true,
	path: "/"
} as const;

// Environment configuration

const HOST = getRequiredEnv( "APP_HOST" );
const PORT = getRequiredEnvNumber( "APP_PORT" );
const ISSUER_URL = getRequiredEnv( "OP_ISSUER" );
const CLIENT_ID = getRequiredEnv( "CLIENT_ID" );
const CLIENT_SECRET = getRequiredEnv( "CLIENT_SECRET" );
const REDIRECT_URI = getRequiredEnv( "REDIRECT_URI" );
const API_BASE_URL = getRequiredEnv( "API_BASE_URL" );
const API_AUDIENCE = getRequiredEnv( "API_AUDIENCE" );
const COOKIE_SECRET = getRequiredEnv( "COOKIE_SECRET" );
const POST_LOGOUT_REDIRECT_URI = process.env.POST_LOGOUT_REDIRECT_URI || HOST;

// Validate ISSUER_URL is an absolute URL — used to build links in views.
// Throwing here fails fast on misconfiguration rather than rendering an
// attacker-controlled string into an attribute later.
const ISSUER_URL_OBJ = ( () => {
	const url = new URL( ISSUER_URL );
	if ( url.protocol !== "https:" && url.protocol !== "http:" ) {
		throw new Error( `OP_ISSUER must be an http(s) URL, got: ${ url.protocol }` );
	}
	return url;
} )();

const app = express();
setupBasicExpress( app );

// Security headers
app.use( createWebSecurityHeaders( API_BASE_URL ) );

// Middleware
app.use( cookieParser( COOKIE_SECRET ) );

// Template engine
setupEJSTemplates( app, new URL( "../views", import.meta.url ).pathname );

// Serve static files (CSS, etc.)
app.use( "/public", express.static( new URL( "../public", import.meta.url ).pathname ) );

let config: client.Configuration | undefined;
let configInitPromise: Promise<client.Configuration> | null = null;
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

/**
 * Safely parse and validate the tokens cookie.
 * Returns null if parsing fails or validation fails.
 */
function parseTokensCookie( cookieValue: string | undefined ): TokenSet | null {
	if ( !cookieValue ) return null;

	const result = safeJsonParse( cookieValue, tokenSetSchema );
	if ( !result.success ) {
		logger.warn( { error: result.error }, "Invalid tokens cookie format" );
		return null;
	}
	return result.data as TokenSet;
}

/**
 * Safely parse the OIDC state cookie.
 * Returns empty object if parsing fails.
 */
function parseOidcCookie( cookieValue: string | undefined ): OidcState {
	if ( !cookieValue ) return { state: "", code_verifier: "", nonce: "" };

	try {
		const parsed = JSON.parse( cookieValue );
		// Basic validation for expected fields
		if ( typeof parsed !== "object" || parsed === null ) {
			return { state: "", code_verifier: "", nonce: "" };
		}
		return {
			state: typeof parsed.state === "string" ? parsed.state : "",
			code_verifier: typeof parsed.code_verifier === "string" ? parsed.code_verifier : "",
			nonce: typeof parsed.nonce === "string" ? parsed.nonce : ""
		};
	} catch {
		logger.warn( "Invalid OIDC state cookie format" );
		return { state: "", code_verifier: "", nonce: "" };
	}
}

/**
 * Mask a token for display, showing only the first and last 4 characters.
 */
function maskToken( token: string | undefined ): string {
	if ( !token ) return "";
	if ( token.length <= 8 ) return "***";
	return `${ token.slice( 0, 4 ) }…${ token.slice( -4 ) }`;
}

/**
 * Decode a JWT without verifying its signature.
 * Returns null if the token is malformed.
 */
function decodeJwtPayload( token: string ): Record<string, unknown> | null {
	try {
		const parts = token.split( "." );
		if ( parts.length !== 3 ) return null;
		return JSON.parse( Buffer.from( parts[1], "base64url" ).toString() );
	} catch {
		return null;
	}
}

/**
 * Determine whether an access token is expired (or close to expiring).
 * Uses a 30 second clock-skew buffer.
 */
function isAccessTokenExpired( accessToken: string ): boolean {
	const payload = decodeJwtPayload( accessToken );
	if ( !payload || typeof payload.exp !== "number" ) {
		// If we cannot read the expiry, treat the token as expired and force a refresh.
		return true;
	}
	const nowSec = Math.floor( Date.now() / 1000 );
	const skewSec = 30;
	return payload.exp <= ( nowSec + skewSec );
}

/**
 * Persist the token set in a signed, httpOnly cookie. Always read existing
 * tokens via this helper's counterpart `parseTokensCookie( req.signedCookies )`.
 */
function writeTokensCookie( res: Response, tokens: TokenSet ): void {
	res.cookie( "tokens", JSON.stringify( {
		access_token: tokens.access_token,
		refresh_token: tokens.refresh_token,
		id_token: tokens.id_token
	} ), SIGNED_COOKIE_OPTIONS );
}

/**
 * Force a token refresh against the authorization server using the refresh
 * token from the signed cookie. Persists the new token set back into the
 * signed cookie and returns the new access token (or `null` when no refresh
 * token is available).
 */
async function refreshTokensAndPersist( req: Request, res: Response ): Promise<string | null> {
	const tokens = parseTokensCookie( ( req as CookieRequest ).signedCookies["tokens"] );
	if ( !tokens?.refresh_token ) return null;

	const cfg = await ensureConfig();
	const refreshed = await client.refreshTokenGrant( cfg, tokens.refresh_token, {
		resource: API_AUDIENCE
	} );

	const nextTokens: TokenSet = {
		access_token: refreshed.access_token,
		refresh_token: refreshed.refresh_token || tokens.refresh_token,
		id_token: refreshed.id_token || tokens.id_token
	};

	writeTokensCookie( res, nextTokens );

	logger.info( {
		rotated: !!refreshed.refresh_token,
		expiresIn: refreshed.expiresIn?.()
	}, "Tokens refreshed and persisted" );

	return nextTokens.access_token;
}

/**
 * Returns a valid (non-expired) access token, refreshing it when needed.
 *
 * 1. Reads tokens from the signed cookie.
 * 2. Checks `exp` on the access token (jose decode + 30s skew buffer).
 * 3. If expired and a refresh token is available, calls the auth server's
 *    token endpoint via openid-client's refresh helper.
 * 4. Atomically writes the new tokens back to the signed cookie before
 *    returning the access token to the caller.
 *
 * Throws when no tokens are present or when refresh fails — callers are
 * expected to map those errors onto an HTTP 401 / re-login flow.
 */
async function getValidAccessToken( req: Request, res: Response ): Promise<string> {
	const tokens = parseTokensCookie( ( req as CookieRequest ).signedCookies["tokens"] );
	if ( !tokens?.access_token ) {
		throw new Error( "No access token in cookie" );
	}

	if ( !isAccessTokenExpired( tokens.access_token ) ) {
		return tokens.access_token;
	}

	if ( !tokens.refresh_token ) {
		throw new Error( "Access token expired and no refresh token available" );
	}

	logger.debug( "Access token expired — attempting refresh" );
	const newAccessToken = await refreshTokensAndPersist( req, res );
	if ( !newAccessToken ) {
		throw new Error( "Refresh did not return a new access token" );
	}
	return newAccessToken;
}

async function delay( ms: number ) {
	await new Promise( ( resolve ) => setTimeout( resolve, ms ) );
}

async function ensureConfig(): Promise<client.Configuration> {
	if ( config ) return config;
	if ( configInitPromise ) return configInitPromise;

	const maxAttempts = 30;
	const backoffMs = 1000;
	configInitPromise = ( async () => {
		let lastError: unknown = null;
		for ( let attempt = 1; attempt <= maxAttempts; attempt++ ) {
			try {
				logger.debug( {
					attempt,
					issuer: ISSUER_URL
				}, "Discovering OIDC issuer" );
				logger.info( "Starting OIDC discovery..." );
				const issuerUrl = new URL( ISSUER_URL );
				const configuration = await client.discovery( issuerUrl, CLIENT_ID, CLIENT_SECRET );
				config = configuration;
				// Initialize JWKS for ID token verification
				jwks = createRemoteJWKSet( new URL( `${ ISSUER_URL }/jwks` ) );
				logger.info( "OIDC discovery completed" );
				logger.debug( { type: typeof configuration }, "Configuration type" );
				logger.debug( { configuration }, "Configuration" );
				return configuration;
			} catch ( err ) {
				lastError = err;
				logger.warn( { err, attempt }, "Issuer discovery failed, will retry" );
				await delay( backoffMs );
			}
		}
		throw lastError ?? new Error( "Issuer discovery failed" );
	} )();

	try {
		return await configInitPromise;
	} finally {
		// Allow subsequent callers to create a new promise if needed
		configInitPromise = null;
	}
}

// Discovery is performed lazily on demand by routes via ensureConfig()

app.get( "/", async ( req: Request, res: Response ) => {
	const tokens = parseTokensCookie( ( req as CookieRequest ).signedCookies["tokens"] );
	res.render( "index", { tokens } );
} );

app.get( "/login", async ( _req: Request, res: Response ) => {
	logger.info( "Login route called" );
	const config = await ensureConfig();
	logger.debug( { type: typeof config }, "Config obtained in login route" );
	const state = client.randomState();
	const code_verifier = client.randomPKCECodeVerifier();
	const code_challenge = await client.calculatePKCECodeChallenge( code_verifier );
	const nonce = client.randomNonce();

	res.cookie( "oidc", JSON.stringify( { state, code_verifier, nonce } ), SIGNED_COOKIE_OPTIONS );

	// RFC 8707 - Resource Indicators for OAuth 2.0
	// The 'resource' parameter specifies the target API (audience) for the access token
	// This tells the authorization server which resource server the token will be used with
	const url = client.buildAuthorizationUrl( config, {
		redirect_uri: REDIRECT_URI,
		scope: "openid email profile offline_access accounts:read",
		state,
		code_challenge,
		code_challenge_method: "S256",
		nonce,
		prompt: "login consent",
		resource: API_AUDIENCE  // Resource indicator - must be absolute URI without fragment
	} );
	logger.debug( { url: url.href }, "Authorization URL generated" );
	res.redirect( url.href );
} );

app.get( "/callback", async ( req: Request, res: Response ) => {
	try {
		const config = await ensureConfig();
		// Force HTTPS protocol since we're behind a proxy
		const currentUrl = new URL( req.originalUrl, `https://${ req.get( "host" ) }` );

		// Safely parse OIDC state cookie (signed)
		const cookieVal = parseOidcCookie( ( req as CookieRequest ).signedCookies["oidc"] );

		logger.debug( { currentUrl: currentUrl.href }, "Callback - Current URL" );
		logger.debug( { redirectUri: REDIRECT_URI }, "Callback - Expected Redirect URI" );
		logger.debug( { codeVerifier: cookieVal.code_verifier ? "present" : "missing" }, "Callback - Code verifier" );
		logger.debug( { state: cookieVal.state ? "present" : "missing" }, "Callback - State" );
		logger.debug( { queryParams: Object.fromEntries( currentUrl.searchParams.entries() ) }, "Callback - Query params" );

		// Check for OAuth errors (e.g., user canceled consent)
		const error = currentUrl.searchParams.get( "error" );
		if ( error ) {
			// Escape error description to prevent XSS attacks
			const rawErrorDescription = currentUrl.searchParams.get( "error_description" ) || "The authorization request was not completed.";
			const errorDescription = escapeHtml( rawErrorDescription.slice( 0, 500 ) ); // Limit length and escape HTML
			logger.info( { error: sanitizeForLogging( error ), errorDescription: sanitizeForLogging( rawErrorDescription ) }, "Callback - OAuth error received" );

			// Clear the OIDC state cookie
			res.clearCookie( "oidc", { path: "/" } );

			return res.status( 400 ).send( `
				<!DOCTYPE html>
				<html>
				<head>
					<title>Authorization Cancelled</title>
					<link href="/public/styles.css" rel="stylesheet">
				</head>
				<body class="bg-plaid-light-gray min-h-screen flex items-center justify-center">
					<div class="max-w-md w-full mx-4">
						<div class="bg-white rounded-lg shadow-lg p-8">
							<div class="text-center">
								<svg class="mx-auto h-12 w-12 text-plaid-piggy-bank-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
								<h2 class="mt-4 text-2xl font-semibold text-plaid-black">Authorization Cancelled</h2>
								<p class="mt-2 text-plaid-gray">${ errorDescription }</p>
								<div class="mt-6">
									<a href="/" class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-plaid-black bg-plaid-mint-400 hover:bg-plaid-blue-sky-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-plaid-mint-400">
										Return Home
									</a>
								</div>
							</div>
						</div>
					</div>
				</body>
				</html>
			` );
		}

		// Check that we have the required parameters
		if ( !cookieVal.code_verifier ) {
			throw new Error( "Missing PKCE code verifier in cookie" );
		}
		if ( !cookieVal.state ) {
			throw new Error( "Missing state in cookie" );
		}
		if ( !cookieVal.nonce ) {
			throw new Error( "Missing nonce in cookie" );
		}

		const authCode = currentUrl.searchParams.get( "code" );
		const receivedState = currentUrl.searchParams.get( "state" );

		logger.debug( { authCode: authCode ? "present" : "missing" }, "Callback - Auth code" );
		logger.debug( { receivedState }, "Callback - Received state" );
		logger.debug( { expectedState: cookieVal.state }, "Callback - Expected state" );

		if ( !authCode ) {
			throw new Error( "Missing authorization code in callback" );
		}
		if ( receivedState !== cookieVal.state ) {
			throw new Error( `State mismatch: expected ${ cookieVal.state }, got ${ receivedState }` );
		}

		// Debug the configuration
		logger.debug( { type: typeof config }, "Config type" );
		logger.debug( { constructor: config.constructor.name }, "Config constructor" );
		logger.debug( { properties: Object.getOwnPropertyNames( config ) }, "Config properties" );
		logger.debug( { prototype: Object.getOwnPropertyNames( Object.getPrototypeOf( config ) ) }, "Config prototype" );
		logger.debug( { url: currentUrl.href }, "Current URL for token exchange" );

		// In openid-client v6, the authorizationCodeGrant handles state validation internally
		// We need to pass the parameters in the expected format
		logger.debug( "About to call authorizationCodeGrant with:" );
		logger.debug( { authCode }, "- Auth code" );
		logger.debug( { state: receivedState }, "- State" );
		logger.debug( { expectedState: cookieVal.state }, "- Expected state" );
		logger.debug( { codeVerifierPresent: !!cookieVal.code_verifier }, "- Code verifier present" );

		// CRITICAL: The 'resource' parameter MUST be included in the token exchange
		// Per RFC 8707, the resource parameter should be sent in BOTH:
		//   1. Authorization request (above in /login route)
		//   2. Token exchange request (here)
		//
		// Why both are needed:
		// - Authorization request: Stores resource in the authorization code
		// - Token exchange: Tells the server which resource to issue the token for
		//
		// Without resource in token exchange, oidc-provider may issue an opaque token
		// for the UserInfo endpoint instead of a JWT for your API, especially when
		// the 'openid' scope is present.
		const tokenSet = await client.authorizationCodeGrant(
			config,
			currentUrl,
			{
				pkceCodeVerifier: cookieVal.code_verifier,
				expectedState: cookieVal.state,
				expectedNonce: cookieVal.nonce  // Validates `nonce` claim in the ID Token
			},
			{
				resource: API_AUDIENCE  // Resource indicator for token exchange (RFC 8707)
			}
		);

		// Persist minimal tokens in a signed, httpOnly cookie (for demo only).
		writeTokensCookie( res, {
			access_token: tokenSet.access_token,
			refresh_token: tokenSet.refresh_token,
			id_token: tokenSet.id_token
		} );
		// One-shot OIDC state cookie is no longer needed once the code is exchanged.
		res.clearCookie( "oidc", { path: "/" } );
		res.redirect( "/api-explorer" );
	} catch ( error ) {
		logError( logger, error, { context: "OAuth callback" } );
		const sanitized = sanitizeError( error, "OAuth callback failed" );
		res.status( 400 ).json( sanitized );
	}
} );

// Refresh token endpoint - manually trigger a token refresh
app.post( "/refresh", async ( req: Request, res: Response ) => {
	const tokens = parseTokensCookie( ( req as CookieRequest ).signedCookies["tokens"] );

	logger.debug( {
		hasTokens: !!tokens,
		hasRefreshToken: !!tokens?.refresh_token
	}, "POST /refresh - Refresh token request" );

	if ( !tokens?.refresh_token ) {
		logger.debug( "POST /refresh - No refresh token available" );
		return res.status( 400 ).json( { error: "No refresh token available" } );
	}

	try {
		const cfg = await ensureConfig();

		logger.debug( {
			refreshTokenPrefix: tokens.refresh_token.substring( 0, 10 ),
			refreshTokenLength: tokens.refresh_token.length
		}, "POST /refresh - Attempting refresh" );

		// Use refreshTokenGrant to exchange refresh token for new tokens
		// The resource parameter must be included here too for the same reasons as above
		const tokenSet = await client.refreshTokenGrant( cfg, tokens.refresh_token, {
			resource: API_AUDIENCE  // Resource indicator for refresh token exchange (RFC 8707)
		} );

		logger.debug( {
			newAccessTokenIssued: !!tokenSet.access_token,
			newRefreshTokenIssued: !!tokenSet.refresh_token,
			newIdTokenIssued: !!tokenSet.id_token
		}, "POST /refresh - Refresh successful" );

		// Update tokens in the signed cookie
		writeTokensCookie( res, {
			access_token: tokenSet.access_token,
			refresh_token: tokenSet.refresh_token || tokens.refresh_token, // Keep old refresh token if no new one
			id_token: tokenSet.id_token || tokens.id_token // Keep old ID token if no new one
		} );

		res.json( {
			success: true,
			message: "Tokens refreshed successfully",
			accessTokenIssued: !!tokenSet.access_token,
			refreshTokenIssued: !!tokenSet.refresh_token,
			idTokenIssued: !!tokenSet.id_token
		} );
	} catch ( error ) {
		logger.debug( {
			errorName: error instanceof Error ? error.name : "unknown",
			errorMessage: error instanceof Error ? error.message : "unknown"
		}, "POST /refresh - Refresh failed" );
		logError( logger, error, { context: "Token refresh" } );
		const sanitized = sanitizeError( error, "Token refresh failed" );
		res.status( 400 ).json( sanitized );
	}
} );

app.get( "/token", async ( req: Request, res: Response ) => {
	const tokens = parseTokensCookie( ( req as CookieRequest ).signedCookies["tokens"] );
	if ( !tokens?.access_token || !tokens?.id_token ) return res.redirect( "/login" );

	try {
		await ensureConfig();

		if ( !jwks ) {
			throw new Error( "JWKS not initialized" );
		}

		// Verify the ID token signature and validate claims
		await jwtVerify( tokens.id_token, jwks, {
			issuer: ISSUER_URL,
			audience: CLIENT_ID
		} );

		// Decode JWT header and payload for display
		const parts = tokens.id_token.split( "." );
		const header = JSON.parse( Buffer.from( parts[0], "base64url" ).toString() );
		const decodedPayload = JSON.parse( Buffer.from( parts[1], "base64url" ).toString() );
		const signature = parts[2]; // The base64url-encoded signature

		// Add annotations to header
		const annotatedHeader = {
			"alg": { value: header.alg, comment: "Algorithm - Cryptographic algorithm used to sign the token" },
			"typ": { value: header.typ, comment: "Type - Token type, always 'JWT' for JSON Web Tokens" },
			"kid": { value: header.kid, comment: "Key ID - Identifier for the key used to sign this token" }
		};

		// Add annotations to payload
		const annotatedPayload: Record<string, { value: unknown; comment: string }> = {};
		Object.keys( decodedPayload ).forEach( ( key ) => {
			const value = decodedPayload[key];

			let comment;
			switch ( key ) {
				case "sub":
					comment = "Subject - Unique identifier for the user";
					break;
				case "iss":
					comment = "Issuer - Who issued this token (Authorization Server URL)";
					break;
				case "aud":
					comment = "Audience - Who this token is intended for (Client ID)";
					break;
				case "exp":
					if ( typeof value === "number" ) {
						const date = new Date( value * 1000 ).toLocaleString( "en-US", {
							dateStyle: "medium",
							timeStyle: "long"
						} );
						comment = `Expiration Time - Unix timestamp (seconds since Jan 1, 1970) when token expires (${ date })`;
					} else {
						comment = "Expiration Time - Unix timestamp when the token expires";
					}
					break;
				case "iat":
					if ( typeof value === "number" ) {
						const date = new Date( value * 1000 ).toLocaleString( "en-US", {
							dateStyle: "medium",
							timeStyle: "long"
						} );
						comment = `Issued At - Unix timestamp (seconds since Jan 1, 1970) when token was issued (${ date })`;
					} else {
						comment = "Issued At - Unix timestamp when the token was issued";
					}
					break;
				case "auth_time":
					if ( typeof value === "number" ) {
						const date = new Date( value * 1000 ).toLocaleString( "en-US", {
							dateStyle: "medium",
							timeStyle: "long"
						} );
						comment = `Authentication Time - Unix timestamp (seconds since Jan 1, 1970) when user authenticated (${ date })`;
					} else {
						comment = "Authentication Time - Unix timestamp when the user authenticated";
					}
					break;
				case "nbf":
					if ( typeof value === "number" ) {
						const date = new Date( value * 1000 ).toLocaleString( "en-US", {
							dateStyle: "medium",
							timeStyle: "long"
						} );
						comment = `Not Before - Unix timestamp (seconds since Jan 1, 1970), token not valid before (${ date })`;
					} else {
						comment = "Not Before - Unix timestamp before which the token is not valid";
					}
					break;
				case "email":
					comment = "Email - User's email address (from 'email' scope)";
					break;
				case "name":
					comment = "Name - User's display name (from 'profile' scope)";
					break;
				case "email_verified":
					comment = "Email Verified - Whether the user's email has been verified";
					break;
				default:
					comment = `Custom claim: ${ key }`;
			}
			annotatedPayload[key] = { value: decodedPayload[key], comment };
		} );

		// Build a validated absolute JWKS URL up front so the view never has to
		// touch process.env / unvalidated strings inside an `href` attribute.
		const jwksUrl = new URL( "/.well-known/jwks.json", ISSUER_URL_OBJ ).href;

		// Render token inspector view with decoded token data
		return res.render( "token", {
			tokens,
			rawToken: tokens.id_token,
			header: annotatedHeader,
			payload: annotatedPayload,
			signature,
			jwksUrl
		} );
	} catch ( error ) {
		logError( logger, error, { context: "ID token verification" } );
		// Clear invalid/expired tokens and redirect to login
		res.clearCookie( "tokens", { path: "/" } );
		res.clearCookie( "oidc", { path: "/" } );
		return res.redirect( "/login" );
	}
} );

app.get( "/api-explorer", async ( req: Request, res: Response ) => {
	const tokens = parseTokensCookie( ( req as CookieRequest ).signedCookies["tokens"] );
	if ( !tokens?.access_token ) return res.redirect( "/login" );

	res.render( "api-explorer", { tokens } );
} );

app.post( "/api-call", express.json(), async ( req: Request, res: Response ) => {
	const tokens = parseTokensCookie( ( req as CookieRequest ).signedCookies["tokens"] );
	if ( !tokens?.access_token ) return res.status( 401 ).json( { error: "No access token" } );

	// Validate API call request against allow-list of endpoints and methods
	const validationResult = apiCallSchema.safeParse( req.body );
	if ( !validationResult.success ) {
		logger.warn( {
			error: formatZodError( validationResult.error ),
			rawEndpoint: sanitizeForLogging( String( req.body?.endpoint || "" ) ),
			rawMethod: sanitizeForLogging( String( req.body?.method || "" ) )
		}, "POST /api-call - Validation failed" );
		return res.status( 400 ).json( {
			error: "Validation failed",
			details: formatZodError( validationResult.error )
		} );
	}

	const { endpoint, method } = validationResult.data;

	// Strip fragment but preserve query string for pagination/filtering
	const sanitizedEndpoint = endpoint.split( "#" )[0];
	const upstreamUrl = `${ API_BASE_URL }${ sanitizedEndpoint }`;

	const callApi = async ( accessToken: string ) => fetch( upstreamUrl, {
		method,
		headers: {
			Authorization: `Bearer ${ accessToken }`,
			"Content-Type": "application/json"
		}
	} );

	try {
		// Auto-refresh on expired access tokens (proactive: based on `exp`).
		let accessToken: string;
		try {
			accessToken = await getValidAccessToken( req, res );
		} catch ( refreshErr ) {
			logError( logger, refreshErr, { context: "Pre-call token refresh" } );
			return res.status( 401 ).json( { error: "Session expired — please log in again" } );
		}

		let apiResponse = await callApi( accessToken );

		// Reactive fallback: the access token looked valid but the API rejected
		// it (e.g. server clock skew, revoked grant). Try one refresh-and-retry.
		if ( apiResponse.status === 401 ) {
			logger.info( "API returned 401 — attempting one refresh-and-retry" );
			try {
				const refreshedToken = await refreshTokensAndPersist( req, res );
				if ( refreshedToken ) {
					apiResponse = await callApi( refreshedToken );
				}
			} catch ( retryErr ) {
				logError( logger, retryErr, { context: "401 refresh-and-retry" } );
				// Fall through with the original 401 response
			}
		}

		const contentType = apiResponse.headers.get( "content-type" );
		let responseData;

		if ( contentType?.includes( "application/pdf" ) ) {
			responseData = {
				type: "pdf",
				size: apiResponse.headers.get( "content-length" ),
				filename: apiResponse.headers.get( "content-disposition" )?.split( "filename=" )[1]
			};
		} else {
			responseData = await apiResponse.json();
		}

		res.json( {
			status: apiResponse.status,
			statusText: apiResponse.statusText,
			data: responseData,
			headers: Object.fromEntries( apiResponse.headers.entries() )
		} );
	} catch ( error ) {
		logError( logger, error, { context: "API call proxy" } );
		res.status( 500 ).json( { error: "Failed to call API", details: ( error as Error ).message } );
	}
} );

app.get( "/debug/tokens", async ( req: Request, res: Response ) => {
	// Gate behind non-production environments — raw tokens (even masked) are
	// debug-only data and should never be reachable in production.
	if ( IS_PRODUCTION ) {
		logger.warn( "GET /debug/tokens - blocked in production" );
		return res.status( 404 ).send( "Not Found" );
	}

	const tokens = parseTokensCookie( ( req as CookieRequest ).signedCookies["tokens"] );

	if ( !tokens?.access_token ) {
		return res.redirect( "/login" );
	}

	const accessTokenPayload = tokens.access_token ? decodeJwtPayload( tokens.access_token ) : null;
	const idTokenPayload = tokens.id_token ? decodeJwtPayload( tokens.id_token ) : null;

	// Mask raw token strings so the rendered HTML never contains the actual
	// access/refresh/id tokens. Decoded payloads are still shown — those are
	// not credentials on their own.
	const maskedTokens = {
		access_token: maskToken( tokens.access_token ),
		refresh_token: tokens.refresh_token ? maskToken( tokens.refresh_token ) : undefined,
		id_token: tokens.id_token ? maskToken( tokens.id_token ) : undefined
	};

	return res.render( "debug-tokens", {
		tokens: maskedTokens,
		accessTokenPayload,
		idTokenPayload,
		// Pass through to the navigation partial so "Authenticated" badge stays correct
		hasTokens: true
	} );
} );

app.get( "/logout", async ( req: Request, res: Response ) => {
	logger.info( "Logout route called" );
	const config = await ensureConfig();
	const tokens = parseTokensCookie( ( req as CookieRequest ).signedCookies["tokens"] );

	logger.debug( { tokensPresent: !!tokens }, "Logout - tokens present" );
	logger.debug( { idTokenPresent: !!tokens?.id_token }, "Logout - id_token present" );

	const serverMetadata = config.serverMetadata();
	logger.debug( {
		issuer: serverMetadata.issuer,
		end_session_endpoint: serverMetadata.end_session_endpoint,
		has_end_session: !!serverMetadata.end_session_endpoint
	}, "Logout - server metadata" );

	// Clear local cookies up front. Even if the RP-initiated logout below
	// fails, the local session is already gone.
	res.clearCookie( "tokens", { path: "/" } );
	res.clearCookie( "oidc", { path: "/" } );

	// RP-initiated logout per OIDC spec:
	//   <end_session_endpoint>?id_token_hint=…&post_logout_redirect_uri=…&state=…
	// The auth server clears its session and redirects back to our app, where
	// `post_logout_redirect_uri` should be a registered URI on the client.
	const endSessionEndpoint = serverMetadata.end_session_endpoint;
	if ( endSessionEndpoint && tokens?.id_token ) {
		const endSessionUrl = new URL( endSessionEndpoint );
		endSessionUrl.searchParams.set( "id_token_hint", tokens.id_token );
		endSessionUrl.searchParams.set( "post_logout_redirect_uri", POST_LOGOUT_REDIRECT_URI );
		endSessionUrl.searchParams.set( "client_id", CLIENT_ID );
		endSessionUrl.searchParams.set( "state", client.randomState() );
		logger.info( { endSession: endSessionUrl.origin + endSessionUrl.pathname }, "Logout - redirecting to end_session_endpoint" );
		return res.redirect( endSessionUrl.href );
	}

	// Fallback: no end_session_endpoint (auth server doesn't support RP-initiated logout)
	// or no id_token to use as a hint. Local logout is the best we can do.
	logger.info( "Logout - end_session_endpoint or id_token missing, performing local logout only" );
	res.redirect( "/" );
} );

app.listen( PORT, "0.0.0.0", () => {
	logger.info( `APP listening at ${ HOST } (local port: ${ PORT })` );
} );
