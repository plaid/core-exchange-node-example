import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";

import customersRouter from "./routes/customers.js";
import accountsRouter from "./routes/accounts.js";

const ISSUER = process.env.OP_ISSUER || "https://id.localtest.me";
const AUDIENCE = process.env.API_AUDIENCE || "api://my-api";
const PORT = Number( process.env.API_PORT || 3003 );
const HOST = process.env.API_HOST || "http://localhost";

const JWKS = createRemoteJWKSet( new URL( `${ ISSUER }/jwks` ) );

const app = express();
app.disable( "x-powered-by" );

app.use( express.json() );

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

// Routes
app.use( "/api/cx", customersRouter );
app.use( "/api/cx", accountsRouter );

// app.get( "/accounts", ( req: Request, res: Response ) => {
// 	const scope = String( ( req as any ).user?.scope || "" ).split( " " );
// 	if ( !scope.includes( "accounts:read" ) )
// 		return res.status( 403 ).json( { error: "insufficient_scope" } );
// 	return res.json( [ { id: "acc_123", name: "Primary Checking" } ] );
// } );

// 404 route handler for undefined routes
app.use( ( req, res ) => {
	res.status( 404 ).json( {
		error: "Not Found",
		message: `Requested resource ${ req.originalUrl } not found`
	} );
} );

app.listen( PORT, "0.0.0.0", () => {
	console.log( `API listening at ${ HOST }${ PORT !== 80 && PORT !== 443 ? `:${ PORT }` : "" }` );
} );
