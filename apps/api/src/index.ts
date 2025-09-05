import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import { createRemoteJWKSet, jwtVerify, JWTPayload } from "jose";
import { webcrypto } from "crypto";
import pino from "pino";

// Polyfill for crypto global in Node.js
if ( !globalThis.crypto ) {
	globalThis.crypto = webcrypto;
}

const logger = pino( {
	transport: {
		target: "pino-pretty",
		options: {
			colorize: true
		}
	}
} );

import customersRouter from "./routes/customers.js";
import accountsRouter from "./routes/accounts.js";
import { sanitizeError, logError, AuthenticationError } from "@apps/shared/security";

// Extend Request interface to include user payload
interface AuthenticatedRequest extends Request {
	user?: JWTPayload;
}

// Environment configuration validation
function getRequiredEnv( name: string, fallback?: string ): string {
	const value = process.env[name] || fallback;
	if ( !value ) {
		logger.error( `Missing required environment variable: ${ name }` );
		process.exit( 1 );
	}
	return value;
}

function getRequiredEnvNumber( name: string, fallback?: number ): number {
	const value = process.env[name];
	const num = value ? Number( value ) : fallback;
	if ( num === undefined || isNaN( num ) ) {
		logger.error( `Environment variable ${ name } must be a valid number${ fallback !== undefined ? `, got: ${ value }` : "" }` );
		process.exit( 1 );
	}
	return num;
}

const ISSUER = getRequiredEnv( "OP_ISSUER", "https://id.localtest.me" );
const AUDIENCE = getRequiredEnv( "API_AUDIENCE", "api://my-api" );
const PORT = getRequiredEnvNumber( "API_PORT", 3003 );
const HOST = getRequiredEnv( "API_HOST", "http://localhost" );

const JWKS = createRemoteJWKSet( new URL( `${ ISSUER }/jwks` ) );

const app = express();
app.disable( "x-powered-by" );

// Security headers
app.use( helmet( {
	contentSecurityPolicy: {
		directives: {
			defaultSrc: [ "'self'" ],
			connectSrc: [ "'self'" ]
		}
	},
	crossOriginEmbedderPolicy: false
} ) );

app.use( express.json() );

// Auth middleware
app.use( async ( req: Request, res: Response, next: NextFunction ) => {
	if ( req.path.startsWith( "/public" ) ) return next();
	const auth = req.headers["authorization"] || "";
	const token =
		typeof auth === "string" && auth.startsWith( "Bearer " ) ? auth.slice( 7 ) : "";
	if ( !token ) {
		const error = new AuthenticationError( "Missing access token" );
		return res.status( 401 ).json( sanitizeError( error, "Authentication required" ) );
	}
	try {
		const parts = token.split( "." );
		if ( parts.length !== 3 ) {
			logger.warn( {
				parts: parts.length,
				tokenLength: token.length
				// Don't log the actual token for security
			}, "Access token not a compact JWS" );
		}
		const { payload } = await jwtVerify( token, JWKS, {
			issuer: ISSUER,
			audience: AUDIENCE
		} );
		( req as AuthenticatedRequest ).user = payload;
		next();
	} catch ( e ) {
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
	const statusCode = ( error as any )?.statusCode || 500;
	res.status( statusCode ).json( sanitized );
} );

app.listen( PORT, "0.0.0.0", () => {
	logger.info( `API listening at ${ HOST } (local port: ${ PORT })` );
} );
