import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Wrap an async Express route handler so any rejected promise is forwarded
 * to Express's error handling middleware via `next(err)` instead of bubbling
 * up as an unhandled rejection.
 *
 * The generic parameters allow callers to use narrower request/response
 * types (for example `AuthenticatedRequest<{ accountId: string }>`) while
 * still producing a standard Express `RequestHandler`.
 */
export function asyncHandler<R extends Request = Request, S extends Response = Response>(
	// eslint-disable-next-line no-unused-vars
	fn: ( req: R, res: S, next: NextFunction ) => Promise<unknown>
): RequestHandler {
	return ( req, res, next ) => {
		Promise.resolve( fn( req as R, res as S, next ) ).catch( next );
	};
}
