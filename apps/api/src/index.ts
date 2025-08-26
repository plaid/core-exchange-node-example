import express, { Request, Response, NextFunction } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";

const ISSUER = process.env.OP_ISSUER || "https://id.localtest.me";
const AUDIENCE = process.env.API_AUDIENCE || "api://my-api";
const PORT = Number( process.env.API_PORT || 3003 );

const JWKS = createRemoteJWKSet( new URL( `${ ISSUER }/jwks` ) );

const app = express();
app.disable( "x-powered-by" );

// Auth middleware
app.use( async ( req: Request, res: Response, next: NextFunction ) => {
	if ( req.path.startsWith( "/public" ) ) return next();
	const auth = req.headers["authorization"] || "";
	const token =
    typeof auth === "string" && auth.startsWith( "Bearer " ) ? auth.slice( 7 ) : "";
	if ( !token ) return res.status( 401 ).json( { error: "missing_token" } );
	try {
		const parts = token.split( "." );
		if ( parts.length !== 3 ) {
			console.warn( "Access token not a compact JWS", {
				parts: parts.length,
				length: token.length,
				prefix: token.slice( 0, 20 )
			} );
		}
		const { payload } = await jwtVerify( token, JWKS, {
			issuer: ISSUER,
			audience: AUDIENCE
		} );
		( req as any ).user = payload;
		next();
	} catch ( e ) {
		console.warn( "JWT verification failed", {
			message: ( e as Error )?.message,
			name: ( e as Error )?.name
		} );
		return res.status( 401 ).json( { error: "invalid_token" } );
	}
} );

app.get( "/public/health", ( _req: Request, res: Response ) =>
	res.json( { ok: true } )
);

app.get( "/accounts", ( req: Request, res: Response ) => {
	const scope = String( ( req as any ).user?.scope || "" ).split( " " );
	if ( !scope.includes( "accounts:read" ) )
		return res.status( 403 ).json( { error: "insufficient_scope" } );
	return res.json( [ { id: "acc_123", name: "Primary Checking" } ] );
} );

app.listen( PORT, "0.0.0.0", () => {
	console.log( `API listening at https://api.localtest.me (local port ${ PORT })` );
} );
