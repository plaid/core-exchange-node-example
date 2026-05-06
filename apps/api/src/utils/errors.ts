/**
 * FDX-compliant error response helpers.
 *
 * Per the FDX spec error responses must contain a numeric `code` and a
 * `message`, and may optionally include a `debugMessage`. The `code` is the
 * FDX error code (long-term persistent identifier) and is allowed to differ
 * from the HTTP status code.
 */

export interface FDXError {
	code: number;
	message: string;
	debugMessage?: string;
}

/**
 * Build an FDX-compliant error body.
 */
export function fdxError( code: number, message: string, debugMessage?: string ): FDXError {
	const body: FDXError = { code, message };
	if ( debugMessage ) body.debugMessage = debugMessage;
	return body;
}

/**
 * Common FDX errors used across routes.
 *
 * Codes loosely follow the FDX spec ranges:
 *   - 6xx: customer / authorization-related errors
 *   - 7xx: account / data-related errors
 */
export const FDXErrors = {
	insufficientScope: ( debugMessage?: string ): FDXError =>
		fdxError( 401, "Insufficient scope for this operation", debugMessage ),

	forbidden: ( debugMessage?: string ): FDXError =>
		fdxError( 403, "Forbidden", debugMessage ),

	customerNotFound: ( debugMessage?: string ): FDXError =>
		fdxError( 601, "A customer with the provided customer ID could not be found", debugMessage ),

	accountNotFound: ( debugMessage?: string ): FDXError =>
		fdxError( 701, "An account with the provided account ID could not be found", debugMessage ),

	statementNotFound: ( debugMessage?: string ): FDXError =>
		fdxError( 702, "A statement with the provided statement ID could not be found", debugMessage ),

	validationFailed: ( debugMessage?: string ): FDXError =>
		fdxError( 400, "Validation failed", debugMessage ),

	internalError: ( debugMessage?: string ): FDXError =>
		fdxError( 500, "Internal server error", debugMessage )
};
