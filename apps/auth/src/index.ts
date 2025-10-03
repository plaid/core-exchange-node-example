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

// Load clients from environment variable, file, or defaults
function loadOIDCClients() {
	// 1. Try OIDC_CLIENTS env var (JSON string)
	if ( process.env.OIDC_CLIENTS ) {
		logger.info( "Loading OIDC clients from OIDC_CLIENTS environment variable" );
		return JSON.parse( process.env.OIDC_CLIENTS );
	}

	// 2. Try .env.clients.json file (for easier multi-client config)
	const clientsFilePath = resolve( process.cwd(), ".env.clients.json" );
	if ( existsSync( clientsFilePath ) ) {
		logger.info( "Loading OIDC clients from .env.clients.json" );
		const fileContent = readFileSync( clientsFilePath, "utf-8" );
		return JSON.parse( fileContent );
	}

	// 3. Fall back to single client from env vars
	logger.info( "Loading single OIDC client from CLIENT_ID/CLIENT_SECRET env vars" );
	return [
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
}

const OIDC_CLIENTS = loadOIDCClients();
logger.info( `Loaded ${ OIDC_CLIENTS.length } OIDC client(s)` );

// Define client type with optional force_refresh_token flag
interface OIDCClientConfig {
	client_id: string;
	client_secret: string;
	redirect_uris: string[];
	post_logout_redirect_uris: string[];
	grant_types: string[];
	response_types: string[];
	token_endpoint_auth_method: string;
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
	{ id: string; email: string; password: string; name: string }
>( [
	[
		"user@example.test",
		{
			id: "user_123",
			email: "user@example.test",
			password: "passw0rd!",
			name: "Dev User"
		}
	]
] );

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const configuration: any = {
	clients: SANITIZED_CLIENTS,
	claims: {
		openid: [ "sub" ],
		profile: [ "name" ],
		email: [ "email" ],
		offline_access: []
	},
	scopes: [ "openid", "profile", "email", "offline_access", "accounts:read" ],
	pkce: { methods: [ "S256" ], required: () => true },
	formats: {
		AccessToken: "jwt"
	},
	// Force JWT access tokens by always providing an audience
	// This is the key - without audience, oidc-provider defaults to opaque tokens
	async extraAccessTokenClaims( _ctx: unknown, token: unknown ) {
		// Adding extra claims forces JWT format
		return {
			aud: "api://my-api",  // Set default audience for all access tokens
			scope: ( token as { scope?: string } )?.scope || "openid"
		};
	},
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
			enabled: false  // Disable to force JWT for all access tokens
		}
	},
	audience: async () => "api://my-api",
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

async function main() {
	const provider = new Provider( ISSUER, configuration );
	// Trust reverse proxy headers (e.g., x-forwarded-proto from Caddy)
	provider.proxy = true;

	// Interactions (login + consent) in-process for simplicity
	app.get( "/interaction/:uid", async ( req: Request, res: Response ) => {
		const { uid } = req.params;
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

		res.render( "interaction", { uid, prompt, scopes: requestedScopes } );
	} );

	app.post(
		"/interaction/:uid/login",
		express.urlencoded( { extended: false } ),
		async ( req: Request, res: Response ) => {
			const { uid } = req.params;
			const email = String( req.body?.email || "" );
			const password = String( req.body?.password || "" );

			logger.debug( {
				uid,
				email,
				passwordProvided: !!password
			}, "POST /interaction/:uid/login - Login attempt" );

			const user = USERS.get( email );
			if ( !user || user.password != password ) {
				logger.debug( { uid, email, userFound: !!user }, "POST /interaction/:uid/login - Authentication failed" );
				return res.status( 401 ).send( "Invalid credentials" );
			}

			logger.debug( {
				uid,
				email,
				userId: user.id
			}, "POST /interaction/:uid/login - Authentication successful" );

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
		}
	);

	app.post(
		"/interaction/:uid/confirm",
		express.urlencoded( { extended: false } ),
		async ( req: Request, res: Response ) => {
			const { uid } = req.params;
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
