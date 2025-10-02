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

// Polyfill for crypto global in Node.js
if ( !globalThis.crypto ) {
	globalThis.crypto = webcrypto as any;
}

// Create logger for APP service
const logger = createLogger( "app" );

// Type definitions
interface OidcState {
	state: string;
	code_verifier: string;
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
}

// Environment configuration

const HOST = getRequiredEnv( "APP_HOST" );
const PORT = getRequiredEnvNumber( "APP_PORT" );
const ISSUER_URL = getRequiredEnv( "OP_ISSUER" );
const CLIENT_ID = getRequiredEnv( "CLIENT_ID" );
const CLIENT_SECRET = getRequiredEnv( "CLIENT_SECRET" );
const REDIRECT_URI = getRequiredEnv( "REDIRECT_URI" );
const API_BASE_URL = getRequiredEnv( "API_BASE_URL" );
const COOKIE_SECRET = getRequiredEnv( "COOKIE_SECRET" );

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
	const tokensCookie = ( req as CookieRequest ).cookies["tokens"];
	const tokens: TokenSet | null = tokensCookie
		? JSON.parse( tokensCookie )
		: null;
	if ( !tokens?.access_token ) return res.redirect( "/login" );
	res.redirect( "/api-explorer" );
} );

app.get( "/login", async ( _req: Request, res: Response ) => {
	logger.info( "Login route called" );
	const config = await ensureConfig();
	logger.debug( { type: typeof config }, "Config obtained in login route" );
	const state = client.randomState();
	const code_verifier = client.randomPKCECodeVerifier();
	const code_challenge = await client.calculatePKCECodeChallenge( code_verifier );

	res.cookie( "oidc", JSON.stringify( { state, code_verifier } ), {
		httpOnly: true,
		sameSite: "lax",
		secure: true,
		path: "/"
	} );

	const url = client.buildAuthorizationUrl( config, {
		redirect_uri: REDIRECT_URI,
		scope: "openid email profile offline_access accounts:read",
		state,
		code_challenge,
		code_challenge_method: "S256",
		prompt: "login consent",
		resource: "api://my-api"
	} );
	logger.debug( { url: url.href }, "Authorization URL generated" );
	res.redirect( url.href );
} );

app.get( "/callback", async ( req: Request, res: Response ) => {
	try {
		const config = await ensureConfig();
		// Force HTTPS protocol since we're behind a proxy
		const currentUrl = new URL( req.originalUrl, `https://${ req.get( "host" ) }` );

		const oidcCookie = ( req as CookieRequest ).cookies["oidc"];
		const cookieVal: OidcState = oidcCookie
			? JSON.parse( oidcCookie )
			: {} as OidcState;

		logger.debug( { currentUrl: currentUrl.href }, "Callback - Current URL" );
		logger.debug( { redirectUri: REDIRECT_URI }, "Callback - Expected Redirect URI" );
		logger.debug( { codeVerifier: cookieVal.code_verifier ? "present" : "missing" }, "Callback - Code verifier" );
		logger.debug( { state: cookieVal.state ? "present" : "missing" }, "Callback - State" );
		logger.debug( { queryParams: Object.fromEntries( currentUrl.searchParams.entries() ) }, "Callback - Query params" );

		// Check that we have the required parameters
		if ( !cookieVal.code_verifier ) {
			throw new Error( "Missing PKCE code verifier in cookie" );
		}
		if ( !cookieVal.state ) {
			throw new Error( "Missing state in cookie" );
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

		const tokenSet = await client.authorizationCodeGrant(
			config,
			currentUrl,
			{
				pkceCodeVerifier: cookieVal.code_verifier,
				expectedState: cookieVal.state
			}
		);

		// Persist minimal tokens in an httpOnly cookie (for demo only).
		res.cookie(
			"tokens",
			JSON.stringify( {
				access_token: tokenSet.access_token,
				refresh_token: tokenSet.refresh_token,
				id_token: tokenSet.id_token
			} ),
			{ httpOnly: true, sameSite: "lax", secure: true, path: "/" }
		);
		res.redirect( "/" );
	} catch ( error ) {
		logError( logger, error, { context: "OAuth callback" } );
		const sanitized = sanitizeError( error, "OAuth callback failed" );
		res.status( 400 ).json( sanitized );
	}
} );

app.get( "/me", async ( req: Request, res: Response ) => {
	const tokensCookie = ( req as CookieRequest ).cookies["tokens"];
	const tokens: TokenSet | null = tokensCookie
		? JSON.parse( tokensCookie )
		: null;
	if ( !tokens?.access_token || !tokens?.id_token ) return res.redirect( "/login" );

	try {
		await ensureConfig();

		if ( !jwks ) {
			throw new Error( "JWKS not initialized" );
		}

		// Verify the ID token signature and validate claims
		const { payload } = await jwtVerify( tokens.id_token, jwks, {
			issuer: ISSUER_URL,
			audience: CLIENT_ID
		} );

		// Render profile view with user info
		const userInfo = {
			sub: payload.sub,
			email: payload.email,
			name: payload.name,
			iat: payload.iat,
			exp: payload.exp,
			iss: payload.iss,
			aud: payload.aud
		};

		return res.render( "profile", { tokens, userInfo } );
	} catch ( error ) {
		logError( logger, error, { context: "ID token verification" } );
		// Clear invalid tokens and redirect to login
		res.clearCookie( "tokens", { path: "/" } );
		const sanitized = sanitizeError( error, "ID token verification failed" );
		return res.status( 401 ).json( sanitized );
	}
} );

app.get( "/accounts", async ( req: Request, res: Response ) => {
	const tokensCookie = ( req as CookieRequest ).cookies["tokens"];
	const tokens: TokenSet | null = tokensCookie
		? JSON.parse( tokensCookie )
		: null;
	if ( !tokens?.access_token ) return res.redirect( "/login" );
	await ensureConfig();

	try {
		// Expect API-scoped JWT access token from authorization flow
		const accessToken = tokens.access_token as string;
		const resApi = await fetch( `${ API_BASE_URL }/api/cx/accounts?limit=3`, {
			headers: { Authorization: `Bearer ${ accessToken }` }
		} );
		const data = await resApi.json();
		res.render( "accounts", { tokens, apiResponse: data } );
	} catch ( error ) {
		logError( logger, error, { context: "Quick API test" } );
		const sanitized = sanitizeError( error, "Failed to call API" );
		res.render( "accounts", { tokens, apiResponse: null, error: sanitized } );
	}
} );

app.get( "/api-explorer", async ( req: Request, res: Response ) => {
	const tokensCookie = ( req as CookieRequest ).cookies["tokens"];
	const tokens: TokenSet | null = tokensCookie
		? JSON.parse( tokensCookie )
		: null;
	if ( !tokens?.access_token ) return res.redirect( "/login" );

	res.render( "api-explorer", { tokens } );
} );

app.post( "/api-call", express.json(), async ( req: Request, res: Response ) => {
	const tokensCookie = ( req as CookieRequest ).cookies["tokens"];
	const tokens: TokenSet | null = tokensCookie
		? JSON.parse( tokensCookie )
		: null;
	if ( !tokens?.access_token ) return res.status( 401 ).json( { error: "No access token" } );

	const { endpoint, method = "GET" } = req.body;
	if ( !endpoint ) {
		return res.status( 400 ).json( { error: "Endpoint is required" } );
	}

	try {
		const accessToken = tokens.access_token as string;
		const apiResponse = await fetch( `${ API_BASE_URL }${ endpoint }`, {
			method,
			headers: {
				Authorization: `Bearer ${ accessToken }`,
				"Content-Type": "application/json"
			}
		} );

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
	const tokensCookie = ( req as CookieRequest ).cookies["tokens"];
	const tokens: TokenSet | null = tokensCookie
		? JSON.parse( tokensCookie )
		: null;

	if ( !tokens?.access_token ) {
		return res.status( 401 ).send( "<h1>No tokens found</h1><p>Please <a href='/login'>login</a> first.</p>" );
	}

	// Decode JWT tokens to show payload
	const decodeJwt = ( token: string ) => {
		try {
			const parts = token.split( "." );
			if ( parts.length !== 3 ) return null;
			const payload = JSON.parse( Buffer.from( parts[1], "base64url" ).toString() );
			return payload;
		} catch {
			return null;
		}
	};

	const accessTokenPayload = tokens.access_token ? decodeJwt( tokens.access_token ) : null;
	const idTokenPayload = tokens.id_token ? decodeJwt( tokens.id_token ) : null;

	// Render as HTML
	res.send( `
<!DOCTYPE html>
<html>
<head>
	<title>Token Debug</title>
	<style>
		body { font-family: monospace; padding: 20px; background: #1e1e1e; color: #d4d4d4; }
		h1 { color: #4ec9b0; }
		h2 { color: #569cd6; margin-top: 30px; }
		pre { background: #252526; padding: 15px; border-radius: 5px; overflow-x: auto; border: 1px solid #3e3e42; }
		.token { word-break: break-all; color: #ce9178; }
		.section { margin-bottom: 40px; }
		a { color: #569cd6; }
	</style>
</head>
<body>
	<h1>🔐 OAuth Token Debug</h1>
	<p><a href="/">← Back to home</a> | <a href="/logout">Logout</a></p>

	<div class="section">
		<h2>Access Token (Raw)</h2>
		<pre class="token">${ tokens.access_token }</pre>
	</div>

	${ accessTokenPayload ? `
	<div class="section">
		<h2>Access Token (Decoded Payload)</h2>
		<pre>${ JSON.stringify( accessTokenPayload, null, 2 ) }</pre>
	</div>
	` : "" }

	${ tokens.id_token ? `
	<div class="section">
		<h2>ID Token (Raw)</h2>
		<pre class="token">${ tokens.id_token }</pre>
	</div>
	` : "" }

	${ idTokenPayload ? `
	<div class="section">
		<h2>ID Token (Decoded Payload)</h2>
		<pre>${ JSON.stringify( idTokenPayload, null, 2 ) }</pre>
	</div>
	` : "" }

	${ tokens.refresh_token ? `
	<div class="section">
		<h2>Refresh Token</h2>
		<pre class="token">${ tokens.refresh_token }</pre>
	</div>
	` : "" }
</body>
</html>
	` );
} );

app.get( "/logout", async ( req: Request, res: Response ) => {
	logger.info( "Logout route called" );
	const config = await ensureConfig();
	const tokensCookie = ( req as CookieRequest ).cookies["tokens"];
	const tokens: TokenSet | null = tokensCookie
		? JSON.parse( tokensCookie )
		: null;

	logger.debug( { tokensPresent: !!tokens }, "Logout - tokens present" );
	logger.debug( { idTokenPresent: !!tokens?.id_token }, "Logout - id_token present" );

	const serverMetadata = config.serverMetadata();
	logger.debug( {
		issuer: serverMetadata.issuer,
		end_session_endpoint: serverMetadata.end_session_endpoint,
		has_end_session: !!serverMetadata.end_session_endpoint
	}, "Logout - server metadata" );

	// Clear local cookies first
	res.clearCookie( "tokens", { path: "/" } );
	res.clearCookie( "oidc", { path: "/" } );

	// For now, skip OIDC logout and just do local logout
	// The complex OIDC logout flow is having issues with the authorization server
	// TODO: Fix OIDC logout flow later
	logger.info( "Logout - performing local logout only" );

	logger.info( "Logout - falling back to local redirect" );
	// Fallback to local redirect if no proper logout endpoint
	res.redirect( "/" );
} );

app.listen( PORT, "0.0.0.0", () => {
	logger.info( `APP listening at ${ HOST } (local port: ${ PORT })` );
} );
