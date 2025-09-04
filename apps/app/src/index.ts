import "dotenv/config";
import express, { Request, Response } from "express";
import cookieParser from "cookie-parser";
import { Issuer, generators, Client } from "openid-client";

// Type definitions
interface OidcState {
	state: string;
	code_verifier: string;
}

interface TokenSet {
	access_token: string;
	id_token?: string;
	refresh_token?: string;
}

interface CookieRequest extends Request {
	cookies: {
		[key: string]: string;
	};
}

// Environment configuration validation
function getRequiredEnv( name: string ): string {
	const value = process.env[name];
	if ( !value ) {
		console.error( `Missing required environment variable: ${ name }` );
		process.exit( 1 );
	}
	return value;
}

function getRequiredEnvNumber( name: string ): number {
	const value = process.env[name];
	if ( !value ) {
		console.error( `Missing required environment variable: ${ name }` );
		process.exit( 1 );
	}
	const num = Number( value );
	if ( isNaN( num ) ) {
		console.error( `Environment variable ${ name } must be a valid number, got: ${ value }` );
		process.exit( 1 );
	}
	return num;
}

const HOST = getRequiredEnv( "APP_HOST" );
const PORT = getRequiredEnvNumber( "APP_PORT" );
const ISSUER_URL = getRequiredEnv( "OP_ISSUER" );
const CLIENT_ID = getRequiredEnv( "CLIENT_ID" );
const CLIENT_SECRET = getRequiredEnv( "CLIENT_SECRET" );
const REDIRECT_URI = getRequiredEnv( "REDIRECT_URI" );
const API_BASE_URL = getRequiredEnv( "API_BASE_URL" );
const COOKIE_SECRET = getRequiredEnv( "COOKIE_SECRET" );

const app = express();
app.disable( "x-powered-by" );
app.use( cookieParser( COOKIE_SECRET ) );

let client: Client | undefined;
let clientInitPromise: Promise<Client> | null = null;

async function delay( ms: number ) {
	await new Promise( ( resolve ) => setTimeout( resolve, ms ) );
}

async function ensureClient(): Promise<Client> {
	if ( client ) return client;
	if ( clientInitPromise ) return clientInitPromise;

	const maxAttempts = 30;
	const backoffMs = 1000;
	clientInitPromise = ( async () => {
		let lastError: unknown = null;
		for ( let attempt = 1; attempt <= maxAttempts; attempt++ ) {
			try {
				console.info( "Discovering OIDC issuer", {
					attempt,
					issuer: ISSUER_URL
				} );
				const issuer = await Issuer.discover( ISSUER_URL );
				const created = new issuer.Client( {
					client_id: CLIENT_ID,
					client_secret: CLIENT_SECRET,
					redirect_uris: [ REDIRECT_URI ],
					response_types: [ "code" ]
				} );
				client = created;
				console.info( "OIDC issuer discovered and client initialized" );
				return created;
			} catch ( err ) {
				lastError = err;
				console.warn( "Issuer discovery failed, will retry", { err, attempt } );
				await delay( backoffMs );
			}
		}
		throw lastError ?? new Error( "Issuer discovery failed" );
	} )();

	try {
		return await clientInitPromise;
	} finally {
		// Allow subsequent callers to create a new promise if needed
		clientInitPromise = null;
	}
}

// Discovery is performed lazily on demand by routes via ensureClient()

app.get( "/", async ( req: Request, res: Response ) => {
	const tokens = ( req as CookieRequest ).cookies?.tokens;
	const body = `
    <html><body style="font-family: system-ui; max-width: 680px; margin: 48px auto;">
      <h2>Dev Client</h2>
      <p>${ tokens ? "Signed in" : "Signed out" }</p>
      <p>
        <a href="/login">Login</a> | <a href="/me">Me</a> | <a href="/accounts">Call API</a> | <a href="/logout">Logout</a>
      </p>
    </body></html>
  `;
	res.type( "text/html" ).send( body );
} );

app.get( "/login", async ( _req: Request, res: Response ) => {
	const oidcClient = await ensureClient();
	const state = generators.state();
	const code_verifier = generators.codeVerifier();
	const code_challenge = generators.codeChallenge( code_verifier );

	res.cookie( "oidc", JSON.stringify( { state, code_verifier } ), {
		httpOnly: true,
		sameSite: "lax",
		secure: true,
		path: "/"
	} );

	const url = oidcClient.authorizationUrl( {
		scope: "openid email profile offline_access accounts:read",
		prompt: "login consent",
		state,
		code_challenge,
		code_challenge_method: "S256",
		resource: "api://my-api"
	} );
	res.redirect( url );
} );

app.get( "/callback", async ( req: Request, res: Response ) => {
	const oidcClient = await ensureClient();
	const params = oidcClient.callbackParams( req );
	const oidcCookie = ( req as CookieRequest ).cookies["oidc"];
	const cookieVal: OidcState = oidcCookie
		? JSON.parse( oidcCookie )
		: {} as OidcState;
	const tokenSet = await oidcClient.callback(
		REDIRECT_URI,
		params,
		{
			state: cookieVal.state,
			code_verifier: cookieVal.code_verifier
		},
		{ exchangeBody: { resource: "api://my-api" } }
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
} );

app.get( "/me", async ( req: Request, res: Response ) => {
	const oidcClient = await ensureClient();
	const tokensCookie = ( req as CookieRequest ).cookies["tokens"];
	const tokens: TokenSet | null = tokensCookie
		? JSON.parse( tokensCookie )
		: null;
	if ( !tokens?.access_token ) return res.redirect( "/login" );
	try {
		const userinfo = await oidcClient.userinfo( tokens.access_token );
		return res.send( { userinfo } );
	} catch {
		// If access_token was issued for API resource it may not be valid at userinfo
		// Try refresh to obtain a token suitable for userinfo (no resource)
		if ( tokens.refresh_token ) {
			const refreshed = await oidcClient.refresh( tokens.refresh_token );
			const userinfo = await oidcClient.userinfo( refreshed.access_token! );
			// Do not overwrite stored API-scoped access_token; return userinfo directly
			return res.send( { userinfo, refreshed: true } );
		}
		return res.status( 401 ).send( { error: "invalid_token" } );
	}
} );

app.get( "/accounts", async ( req: Request, res: Response ) => {
	const tokensCookie = ( req as CookieRequest ).cookies["tokens"];
	const tokens: TokenSet | null = tokensCookie
		? JSON.parse( tokensCookie )
		: null;
	if ( !tokens?.access_token ) return res.redirect( "/login" );
	await ensureClient();
	// Expect API-scoped JWT access token from authorization flow
	const accessToken = tokens.access_token as string;
	const resApi = await fetch( `${ API_BASE_URL }/api/cx/accounts?limit=3`, {
		headers: { Authorization: `Bearer ${ accessToken }` }
	} );
	const data = await resApi.json();
	res.send( data );
} );

app.get( "/logout", async ( _req: Request, res: Response ) => {
	res.clearCookie( "tokens", { path: "/" } );
	res.clearCookie( "oidc", { path: "/" } );
	res.redirect( "/" );
} );

app.listen( PORT, "0.0.0.0", () => {
	console.log( `APP listening at ${ HOST } (local port: ${ PORT })` );
} );
