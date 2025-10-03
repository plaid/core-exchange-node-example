import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import { createRemoteJWKSet, jwtVerify, JWTPayload } from "jose";
import { webcrypto } from "crypto";

// Polyfill for crypto global in Node.js
if ( !globalThis.crypto ) {
	globalThis.crypto = webcrypto;
}

import customersRouter from "./routes/customers.js";
import accountsRouter from "./routes/accounts.js";
import {
	sanitizeError,
	logError,
	AuthenticationError,
	getRequiredEnv,
	getRequiredEnvNumber,
	createLogger,
	createApiSecurityHeaders,
	setupBasicExpress
} from "@apps/shared";

// Extend Request interface to include user payload
interface AuthenticatedRequest extends Request {
	user?: JWTPayload;
}

// Create logger for API service
const logger = createLogger( "api" );

const ISSUER = getRequiredEnv( "OP_ISSUER", "https://id.localtest.me" );
const AUDIENCE = getRequiredEnv( "API_AUDIENCE", "api://my-api" );
const PORT = getRequiredEnvNumber( "API_PORT", 3003 );
const HOST = getRequiredEnv( "API_HOST", "http://localhost" );

const JWKS = createRemoteJWKSet( new URL( `${ ISSUER }/jwks` ) );

const app = express();
setupBasicExpress( app );

// Security headers
app.use( createApiSecurityHeaders() );

app.use( express.json() );

// Auth middleware
app.use( async ( req: Request, res: Response, next: NextFunction ) => {
	if ( req.path.startsWith( "/public" ) ) return next();

	logger.debug( {
		method: req.method,
		path: req.path,
		query: req.query,
		hasAuthHeader: !!req.headers["authorization"]
	}, "API request received" );

	const auth = req.headers["authorization"] || "";
	const token =
		typeof auth === "string" && auth.startsWith( "Bearer " ) ? auth.slice( 7 ) : "";

	if ( !token ) {
		logger.debug( {
			path: req.path,
			authHeader: auth ? "present but invalid format" : "missing"
		}, "Token validation failed - No bearer token" );
		const error = new AuthenticationError( "Missing access token" );
		return res.status( 401 ).json( sanitizeError( error, "Authentication required" ) );
	}

	// Log token structure (first/last 10 chars for debugging without exposing full token)
	logger.debug( {
		path: req.path,
		tokenPrefix: token.substring( 0, 10 ),
		tokenSuffix: token.substring( token.length - 10 ),
		tokenLength: token.length
	}, "Token received, attempting validation" );

	try {
		const parts = token.split( "." );
		if ( parts.length !== 3 ) {
			logger.warn( {
				parts: parts.length,
				tokenLength: token.length
			}, "Access token not a compact JWS" );
		}
		const { payload } = await jwtVerify( token, JWKS, {
			issuer: ISSUER,
			audience: AUDIENCE
		} );

		logger.debug( {
			path: req.path,
			sub: payload.sub,
			scope: payload.scope,
			clientId: payload.client_id,
			iss: payload.iss,
			aud: payload.aud,
			exp: payload.exp,
			iat: payload.iat
		}, "Token validation successful" );

		( req as AuthenticatedRequest ).user = payload;
		next();
	} catch ( e ) {
		logger.debug( {
			path: req.path,
			errorName: e instanceof Error ? e.name : "unknown",
			errorMessage: e instanceof Error ? e.message : "unknown"
		}, "Token validation failed" );
		logError( logger, e, { context: "JWT verification" } );
		const error = new AuthenticationError( "Invalid access token" );
		return res.status( 401 ).json( sanitizeError( error, "Authentication failed" ) );
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
		error: "not_found",
		message: "Requested resource not found"
	} );
} );

// Global error handler
app.use( ( error: unknown, req: Request, res: Response ) => {
	logError( logger, error, { path: req.path, method: req.method } );
	const sanitized = sanitizeError( error );
	const statusCode = typeof error === "object" && error !== null && "statusCode" in error
		? ( error as { statusCode: number } ).statusCode
		: 500;
	res.status( statusCode ).json( sanitized );
} );

app.listen( PORT, "0.0.0.0", () => {
	logger.info( `API listening at ${ HOST } (local port: ${ PORT })` );
} );
