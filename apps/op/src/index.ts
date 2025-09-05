import "dotenv/config";
import express, { Request, Response } from "express";
import { Provider, errors } from "oidc-provider";

// Environment configuration validation
function getRequiredEnv( name: string, fallback?: string ): string {
	const value = process.env[name] || fallback;
	if ( !value ) {
		console.error( `Missing required environment variable: ${ name }` );
		process.exit( 1 );
	}
	return value;
}

function getRequiredEnvNumber( name: string, fallback?: number ): number {
	const value = process.env[name];
	const num = value ? Number( value ) : fallback;
	if ( num === undefined || isNaN( num ) ) {
		console.error( `Environment variable ${ name } must be a valid number${ fallback !== undefined ? `, got: ${ value }` : "" }` );
		process.exit( 1 );
	}
	return num;
}

const ISSUER = getRequiredEnv( "OP_ISSUER", "https://id.localtest.me" );
const CLIENT_ID = getRequiredEnv( "CLIENT_ID", "dev-rp" );
const CLIENT_SECRET = getRequiredEnv( "CLIENT_SECRET", "dev-secret" );
const REDIRECT_URI = getRequiredEnv( "REDIRECT_URI", "https://app.localtest.me/callback" );
const PORT = getRequiredEnvNumber( "OP_PORT", 3001 );

const app = express();
app.disable( "x-powered-by" );

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

const configuration: any = {
	clients: [
		{
			client_id: CLIENT_ID,
			client_secret: CLIENT_SECRET,
			redirect_uris: [ REDIRECT_URI ],
			post_logout_redirect_uris: [ "https://app.localtest.me" ],
			grant_types: [ "authorization_code", "refresh_token" ],
			response_types: [ "code" ],
			token_endpoint_auth_method: "client_secret_basic"
		}
	],
	claims: { openid: [ "sub" ], profile: [ "name" ], email: [ "email" ] },
	scopes: [ "openid", "profile", "email", "offline_access", "accounts:read" ],
	pkce: { methods: [ "S256" ], required: () => true },
	formats: { AccessToken: "jwt" },
	features: {
		devInteractions: { enabled: false }, // we provide our own interactions
		rpInitiatedLogout: {
			enabled: true,
			logoutSource: async ( ctx: any, form: string ) => {
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
			enabled: true,
			// When a resource is requested, return Resource Server config
			async getResourceServerInfo(
				_ctx: any,
				resourceIndicator: string
			) {
				if ( resourceIndicator === "api://my-api" ) {
					return {
						scope: "accounts:read",
						audience: "api://my-api",
						accessTokenFormat: "jwt",
						jwt: {
							sign: { alg: "RS256" }
						}
					};
				}
				throw new Error( "Unknown resource indicator" );
			},
			// Ensure we use the resource-specific token format
			useGrantedResource() {
				return true;
			}
		}
	},
	audience: async () => "api://my-api",
	// Adapter TODO: move to Postgres adapter for persistence in real testing
	// See oidc-provider docs for Adapter interface
	findAccount: async ( _ctx: any, sub: string ) => ( {
		accountId: sub,
		async claims() {
			// naive mapping: sub is the user id
			for ( const [ , u ] of USERS )
				if ( u.id === sub ) return { sub, email: u.email, name: u.name };
			return { sub };
		}
	} ),
	interactions: {
		url: ( ctx: any, interaction: any ) => `/interaction/${ interaction.uid }`
	}
};

async function main() {
	const provider = new Provider( ISSUER, configuration );
	// Trust reverse proxy headers (e.g., x-forwarded-proto from Caddy)
	provider.proxy = true;

	// Interactions (login + consent) in-process for simplicity
	app.get( "/interaction/:uid", async ( req: Request, res: Response ) => {
		const { uid } = req.params as any;
		const details = await provider.interactionDetails( req, res );
		const prompt = details.prompt.name; // "login" or "consent"

		const html = `
      <html>
        <body style="font-family: system-ui; max-width: 420px; margin: 48px auto;">
          <h2>OIDC Dev Login</h2>
          <p>Interaction: ${ uid } (${ prompt })</p>
          ${
				prompt === "login"
					? `<form method="post" action="/interaction/${ uid }/login">
                  <label>Email <input name="email" type="email" value="user@example.test" /></label><br/>
                  <label>Password <input name="password" type="password" value="passw0rd!" /></label><br/>
                  <button type="submit">Login</button>
                 </form>`
					: `<form method="post" action="/interaction/${ uid }/confirm">
                  <p>Approve scopes: openid profile email accounts:read</p>
                  <button type="submit">Approve</button>
                 </form>`
			}
        </body>
      </html>
    `;
		res.type( "text/html" ).send( html );
	} );

	app.post(
		"/interaction/:uid/login",
		express.urlencoded( { extended: false } ),
		async ( req: Request, res: Response ) => {
			// const { uid } = req.params as any; // uid not used in this handler
			const email = ( req.body as any )?.email || "";
			const password = ( req.body as any )?.password || "";

			const user = USERS.get( email );
			if ( !user || user.password != password ) {
				return res.status( 401 ).send( "Invalid credentials" );
			}

			const result = {
				login: { accountId: user.id }
				// You can remember the login with a cookie/session in a real app
			};
			const redirectTo = await provider.interactionResult( req, res, result, {
				mergeWithLastSubmission: false
			} );
			return res.redirect( 303, redirectTo );
		}
	);

	app.post(
		"/interaction/:uid/confirm",
		express.urlencoded( { extended: false } ),
		async ( req: Request, res: Response ) => {
			// const { uid } = req.params as any; // uid not used in this handler
			const details = await provider.interactionDetails( req, res );
			const { grantId, prompt } = details;

			// Reuse existing grant or create a new one
			const grant = grantId
				? await provider.Grant.find( grantId )
				: new provider.Grant( {
					accountId: details.session!.accountId!,
					clientId: details.params.client_id as string
				} );

			// Always include originally requested scopes from the authorization request
			const requestedScopes = String(
				( details.params as any )?.scope || ""
			).trim();
			if ( requestedScopes ) {
				grant.addOIDCScope( requestedScopes );
			}

			// Grant exactly what is being requested by this prompt
			const missingOIDCScopes = ( prompt as any )?.details?.missingOIDCScopes as
        | string[]
        | undefined;
			if ( missingOIDCScopes && missingOIDCScopes.length > 0 ) {
				grant.addOIDCScope( missingOIDCScopes.join( " " ) );
			}

			const missingOIDCClaims = ( prompt as any )?.details?.missingOIDCClaims as
        | Record<string, unknown>
        | undefined;
			if ( missingOIDCClaims && Object.keys( missingOIDCClaims ).length > 0 ) {
				grant.addOIDCClaims( Object.keys( missingOIDCClaims ) );
			}

			const missingResourceScopes = ( prompt as any )?.details
				?.missingResourceScopes as Record<string, string[]> | undefined;
			if ( missingResourceScopes ) {
				for ( const [ resourceIndicator, scopes ] of Object.entries(
					missingResourceScopes
				) ) {
					if ( scopes.length > 0 ) {
						grant.addResourceScope( resourceIndicator, scopes.join( " " ) );
					}
				}
			}

			const finalGrantId = await grant.save();

			const result = { consent: { grantId: finalGrantId } };
			const redirectTo = await provider.interactionResult( req, res, result, {
				mergeWithLastSubmission: true
			} );
			return res.redirect( 303, redirectTo );
		}
	);

	// Hand off all other routes to oidc-provider
	app.use( ( req: Request, res: Response ) => {
		const callback = provider.callback();
		callback( req, res );
	} );

	app.listen( PORT, "0.0.0.0", () => {
		console.log( `OP listening at ${ ISSUER } (local port: ${ PORT })` );
	} );
}

main().catch( ( e ) => {
	if ( e instanceof errors.OIDCProviderError ) console.error( e );
	else console.error( e );
	process.exit( 1 );
} );
