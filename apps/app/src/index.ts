import express, { Request, Response } from "express";
import cookieParser from "cookie-parser";
import { Issuer, generators, Client } from "openid-client";

const ISSUER_URL = process.env.OP_ISSUER || "https://id.localtest.me";
const CLIENT_ID = process.env.CLIENT_ID || "dev-rp";
const CLIENT_SECRET = process.env.CLIENT_SECRET || "dev-secret";
const REDIRECT_URI =
  process.env.REDIRECT_URI || "https://app.localtest.me/callback";
const API_BASE_URL = process.env.API_BASE_URL || "https://api.localtest.me";
const PORT = Number( process.env.APP_PORT || 3004 );

const app = express();
app.disable( "x-powered-by" );
app.use( cookieParser( "dev-secret" ) );

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
	const tokens = ( req.cookies as any )?.tokens;
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
	const params = oidcClient.callbackParams( req as any );
	const cookieVal = ( req.cookies as any )["oidc"]
		? JSON.parse( String( ( req.cookies as any )["oidc"] ) )
		: {};
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
	const tokens = ( req.cookies as any )["tokens"]
		? JSON.parse( String( ( req.cookies as any )["tokens"] ) )
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
	const tokens = ( req.cookies as any )["tokens"]
		? JSON.parse( String( ( req.cookies as any )["tokens"] ) )
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
	console.log( `APP listening at https://app.localtest.me (local port ${ PORT })` );
} );
