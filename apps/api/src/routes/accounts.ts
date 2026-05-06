import express, { Response } from "express";
import {
	getAccounts,
	getAccountForCustomer,
	getAccountContactById,
	getAccountStatements,
	getAccountStatementById,
	getAccountTransactions,
	getPaymentNetworks,
	getAssetTransferNetworks
} from "../data/accountsRepository.js";
import {
	paginationSchema,
	dateRangePaginationSchema,
	accountIdSchema,
	statementIdSchema,
	sanitizeForLogging,
	formatZodError,
	type PaginationParams,
	type DateRangePaginationParams
} from "@apps/shared/validation";
import { createLogger } from "@apps/shared";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AuthenticatedRequest, getSubject } from "../utils/auth.js";
import { FDXErrors } from "../utils/errors.js";

const logger = createLogger( "api:accounts" );

const router = express.Router();

/**
 * Validate and parse pagination query parameters.
 * Returns validated params with bounds checking applied.
 */
function validatePagination( query: Record<string, unknown> ): PaginationParams {
	const result = paginationSchema.safeParse( query );
	if ( !result.success ) {
		// Return defaults if validation fails
		return { offset: 0, limit: 100 };
	}
	return result.data;
}

/**
 * Validate and parse date range with pagination query parameters.
 * Returns null with error details if validation fails.
 */
function validateDateRangePagination( query: Record<string, unknown> ): { success: true; data: DateRangePaginationParams } | { success: false; error: string } {
	const result = dateRangePaginationSchema.safeParse( query );
	if ( !result.success ) {
		return { success: false, error: formatZodError( result.error ) };
	}
	return { success: true, data: result.data };
}

/**
 * Validate account ID path parameter.
 * Returns null with error details if validation fails.
 */
function validateAccountId( accountId: string ): { success: true; data: string } | { success: false; error: string } {
	const result = accountIdSchema.safeParse( accountId );
	if ( !result.success ) {
		return { success: false, error: formatZodError( result.error ) };
	}
	return { success: true, data: result.data };
}

/**
 * Validate statement ID path parameter.
 * Returns null with error details if validation fails.
 */
function validateStatementId( statementId: string ): { success: true; data: string } | { success: false; error: string } {
	const result = statementIdSchema.safeParse( statementId );
	if ( !result.success ) {
		return { success: false, error: formatZodError( result.error ) };
	}
	return { success: true, data: result.data };
}

/**
 * Resolve and authorize an account against the authenticated user.
 *
 * Returns the account when (a) the user is authenticated, (b) the account
 * exists, and (c) the account is owned by the authenticated user. Otherwise
 * writes the appropriate FDX error response and returns null. Treats
 * not-owned identically to not-found (404) so we don't leak existence of
 * other customers' accounts.
 */
async function resolveOwnedAccount(
	req: AuthenticatedRequest<{ accountId: string }>,
	res: Response,
	accountId: string
) {
	const userId = getSubject( req );
	if ( !userId ) {
		res.status( 401 ).json( FDXErrors.insufficientScope( "Missing authenticated subject" ) );
		return null;
	}

	const account = await getAccountForCustomer( accountId, userId );
	if ( !account ) {
		res.status( 404 ).json( FDXErrors.accountNotFound() );
		return null;
	}
	return account;
}

// GET /accounts - lists accounts owned by the authenticated user only
router.get(
	"/accounts",
	asyncHandler( async ( req: AuthenticatedRequest, res: Response ) => {
		const userId = getSubject( req );
		if ( !userId ) {
			return res.status( 401 ).json( FDXErrors.insufficientScope( "Missing authenticated subject" ) );
		}

		const { offset, limit } = validatePagination( req.query );

		const result = await getAccounts( userId, offset, limit );

		// Calculate pagination metadata
		const hasMore = offset + limit < result.total;
		const page = hasMore ? { nextOffset: String( offset + limit ) } : {};

		return res.json( {
			page,
			accounts: result.accounts
		} );
	} )
);

router.get(
	"/accounts/:accountId",
	asyncHandler( async ( req: AuthenticatedRequest<{ accountId: string }>, res: Response ) => {
		const accountIdResult = validateAccountId( req.params.accountId );
		if ( !accountIdResult.success ) {
			return res.status( 400 ).json( FDXErrors.validationFailed( accountIdResult.error ) );
		}
		const accountId = accountIdResult.data;

		const account = await resolveOwnedAccount( req, res, accountId );
		if ( !account ) return;

		return res.json( account );
	} )
);

router.get(
	"/accounts/:accountId/contact",
	asyncHandler( async ( req: AuthenticatedRequest<{ accountId: string }>, res: Response ) => {
		const accountIdResult = validateAccountId( req.params.accountId );
		if ( !accountIdResult.success ) {
			return res.status( 400 ).json( FDXErrors.validationFailed( accountIdResult.error ) );
		}
		const accountId = accountIdResult.data;

		const account = await resolveOwnedAccount( req, res, accountId );
		if ( !account ) return;

		const contact = await getAccountContactById( accountId );
		if ( !contact ) {
			return res.status( 404 ).json( FDXErrors.accountNotFound() );
		}

		return res.json( contact );
	} )
);

// GET /accounts/:accountId/statements with pagination support
router.get(
	"/accounts/:accountId/statements",
	asyncHandler( async ( req: AuthenticatedRequest<{ accountId: string }>, res: Response ) => {
		const accountIdResult = validateAccountId( req.params.accountId );
		if ( !accountIdResult.success ) {
			return res.status( 400 ).json( FDXErrors.validationFailed( accountIdResult.error ) );
		}
		const accountId = accountIdResult.data;

		const queryResult = validateDateRangePagination( req.query );
		if ( !queryResult.success ) {
			return res.status( 400 ).json( FDXErrors.validationFailed( queryResult.error ) );
		}
		const { offset, limit, startTime, endTime } = queryResult.data;

		const account = await resolveOwnedAccount( req, res, accountId );
		if ( !account ) return;

		const result = await getAccountStatements( accountId, offset, limit, startTime || "", endTime || "" );

		const hasMore = offset + limit < result.total;
		const page = hasMore ? { nextOffset: String( offset + limit ) } : {};

		return res.json( {
			page,
			statements: result.statements
		} );
	} )
);

// GET /accounts/:accountId/statements/:statementId - simulate returning a PDF
router.get(
	"/accounts/:accountId/statements/:statementId",
	asyncHandler( async ( req: AuthenticatedRequest<{ accountId: string; statementId: string }>, res: Response ) => {
		const accountIdResult = validateAccountId( req.params.accountId );
		if ( !accountIdResult.success ) {
			return res.status( 400 ).json( FDXErrors.validationFailed( accountIdResult.error ) );
		}
		const accountId = accountIdResult.data;

		const statementIdResult = validateStatementId( req.params.statementId );
		if ( !statementIdResult.success ) {
			return res.status( 400 ).json( FDXErrors.validationFailed( statementIdResult.error ) );
		}
		const statementId = statementIdResult.data;

		const account = await resolveOwnedAccount( req, res, accountId );
		if ( !account ) return;

		const statement = await getAccountStatementById( accountId, statementId );
		if ( !statement ) {
			logger.debug( {
				accountId: sanitizeForLogging( accountId ),
				statementId: sanitizeForLogging( statementId )
			}, "Statement not found for account" );
			return res.status( 404 ).json( FDXErrors.statementNotFound() );
		}

		// Minimal valid PDF bytes: %PDF-1.4 ... %%EOF
		const pdfContent = "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n";
		const buffer = Buffer.from( pdfContent, "utf8" );

		res.setHeader( "Content-Type", "application/pdf" );
		res.setHeader( "Content-Disposition", `inline; filename=statement-${ statementId }.pdf` );
		res.setHeader( "Content-Length", buffer.length.toString() );
		return res.status( 200 ).send( buffer );
	} )
);

// GET /accounts/:accountId/transactions with pagination support
router.get(
	"/accounts/:accountId/transactions",
	asyncHandler( async ( req: AuthenticatedRequest<{ accountId: string }>, res: Response ) => {
		const accountIdResult = validateAccountId( req.params.accountId );
		if ( !accountIdResult.success ) {
			return res.status( 400 ).json( FDXErrors.validationFailed( accountIdResult.error ) );
		}
		const accountId = accountIdResult.data;

		const queryResult = validateDateRangePagination( req.query );
		if ( !queryResult.success ) {
			return res.status( 400 ).json( FDXErrors.validationFailed( queryResult.error ) );
		}
		const { offset, limit, startTime, endTime } = queryResult.data;

		const account = await resolveOwnedAccount( req, res, accountId );
		if ( !account ) return;

		const result = await getAccountTransactions( accountId, offset, limit, startTime || "", endTime || "" );
		const hasMore = offset + limit < result.total;
		const page = hasMore ? { nextOffset: String( offset + limit ) } : {};
		return res.json( {
			page,
			transactions: result.transactions
		} );
	} )
);

// GET /accounts/:accountId/payment-networks with pagination support
router.get(
	"/accounts/:accountId/payment-networks",
	asyncHandler( async ( req: AuthenticatedRequest<{ accountId: string }>, res: Response ) => {
		const accountIdResult = validateAccountId( req.params.accountId );
		if ( !accountIdResult.success ) {
			return res.status( 400 ).json( FDXErrors.validationFailed( accountIdResult.error ) );
		}
		const accountId = accountIdResult.data;

		const { offset, limit } = validatePagination( req.query );

		const account = await resolveOwnedAccount( req, res, accountId );
		if ( !account ) return;

		const result = await getPaymentNetworks( accountId, offset, limit );
		const hasMore = offset + limit < result.total;
		const page = hasMore ? { nextOffset: String( offset + limit ) } : {};

		return res.json( {
			page,
			paymentNetworks: result.paymentNetworks
		} );
	} )
);

// GET /accounts/:accountId/asset-transfer-networks with pagination support
router.get(
	"/accounts/:accountId/asset-transfer-networks",
	asyncHandler( async ( req: AuthenticatedRequest<{ accountId: string }>, res: Response ) => {
		const accountIdResult = validateAccountId( req.params.accountId );
		if ( !accountIdResult.success ) {
			return res.status( 400 ).json( FDXErrors.validationFailed( accountIdResult.error ) );
		}
		const accountId = accountIdResult.data;

		const { offset, limit } = validatePagination( req.query );

		const account = await resolveOwnedAccount( req, res, accountId );
		if ( !account ) return;

		const result = await getAssetTransferNetworks( accountId, offset, limit );
		const hasMore = offset + limit < result.total;
		const page = hasMore ? { nextOffset: String( offset + limit ) } : {};
		return res.json( {
			page,
			assetTransferNetworks: result.assetTransferNetworks
		} );
	} )
);

export default router;
