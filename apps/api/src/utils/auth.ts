import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { JWTPayload } from "jose";
import { FDXErrors } from "./errors.js";

/**
 * Augment Express's `Request` so route handlers can read the verified JWT
 * payload at `req.user` without per-route casts. Populated by the JWT
 * verification middleware in apps/api/src/index.ts.
 */
declare global {
	namespace Express {
		interface Request {
			user?: JWTPayload;
		}
	}
}

/**
 * Convenience alias for handlers that require an authenticated request.
 * Uses Express's standard generics so it remains assignable to plain
 * `RequestHandler` parameters and to `asyncHandler`.
 */
export type AuthenticatedRequest<
	P = Record<string, string>,
	ResBody = unknown,
	ReqBody = unknown,
	// Use `any` (matching express-serve-static-core's defaults) so this type
	// remains assignable wherever a plain `Request` is expected without
	// triggering ParsedQs incompatibilities.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	ReqQuery = any
> = Request<P, ResBody, ReqBody, ReqQuery> & { user?: JWTPayload };

/**
 * Extract the authenticated subject (user id) from the verified JWT payload.
 * Returns null when no user is attached or `sub` is missing.
 */
export function getSubject( req: Request ): string | null {
	const user = req.user;
	return typeof user?.sub === "string" && user.sub.length > 0 ? user.sub : null;
}

/**
 * Parse the space-separated `scope` claim from a verified JWT into a Set.
 */
function parseScopes( scopeClaim: unknown ): Set<string> {
	if ( typeof scopeClaim !== "string" ) return new Set();
	return new Set( scopeClaim.split( " " ).filter( Boolean ) );
}

/**
 * Express middleware factory that requires the authenticated token's `scope`
 * claim to contain every scope in `requiredScopes`. Responds with HTTP 403
 * and an FDX error body when scopes are missing.
 *
 * Must run after the JWT-verification middleware that attaches `req.user`.
 */
export function requireScope( ...requiredScopes: string[] ): RequestHandler {
	return ( req: Request, res: Response, next: NextFunction ) => {
		const user = req.user;
		if ( !user ) {
			return res.status( 401 ).json( FDXErrors.insufficientScope( "Missing authentication context" ) );
		}

		const grantedScopes = parseScopes( user.scope );
		const missing = requiredScopes.filter( ( s ) => !grantedScopes.has( s ) );
		if ( missing.length > 0 ) {
			return res.status( 403 ).json(
				FDXErrors.forbidden( `Missing required scope(s): ${ missing.join( " " ) }` )
			);
		}

		return next();
	};
}
