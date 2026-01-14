import express, { Request, Response } from "express";
import { getAccounts, getAccountById, getAccountContactById, getAccountStatements, getAccountStatementById, getAccountTransactions, getPaymentNetworks, getAssetTransferNetworks } from "../data/accountsRepository.js";
import pino from "pino";
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

const logger = pino( {
	transport: {
		target: "pino-pretty",
		options: {
			colorize: true
		}
	}
} );

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

// Shared helper to validate account existence and send appropriate HTTP responses
// Returns the account object if found; otherwise handles the response and returns null
async function verifyAccount( accountId: string, res: Response, notFoundCode = 701 ) {
	try {
		const account = await getAccountById( accountId );
		if ( !account ) {
			res.status( 404 ).json( { code: notFoundCode, error: "An account with the provided account ID could not be found" } );
			return null;
		}
		return account;
	} catch ( error ) {
		logger.error( error, "Error validating account" );
		res.status( 500 ).json( { error: "Internal server error" } );
		return null;
	}
}

// GET /accounts with pagination support
router.get( "/accounts", async ( req: Request, res: Response ) => {
	// Validate and extract pagination parameters with bounds checking
	const { offset, limit } = validatePagination( req.query );

	try {
		// Get accounts using the repository
		const result = await getAccounts( offset, limit );

		// Calculate pagination metadata
		const hasMore = offset + limit < result.total;
		const page = hasMore ? { nextOffset: String( offset + limit ) } : {};

		// Construct response
		const response = {
			page,
			accounts: result.accounts
		};

		res.json( response );
	} catch ( error ) {
		logger.error( error, "Error retrieving accounts" );
		res.status( 500 ).json( { error: "Internal server error" } );
	}
} );

router.get( "/accounts/:accountId", async ( req: Request<{ accountId: string }>, res: Response ) => {
	// Validate accountId path parameter
	const accountIdResult = validateAccountId( req.params.accountId );
	if ( !accountIdResult.success ) {
		return res.status( 400 ).json( { error: "Validation failed", details: accountIdResult.error } );
	}
	const accountId = accountIdResult.data;

	try {
		const account = await getAccountById( accountId );

		if ( !account ) {
			return res.status( 404 ).json( { code: 701, error: "An account with the provided account ID could not be found" } );
		}

		res.json( account );
	} catch {
		logger.error( { accountId: sanitizeForLogging( accountId ) }, "Error retrieving account" );
		res.status( 500 ).json( { error: "Internal server error" } );
	}
} );

router.get( "/accounts/:accountId/contact", async ( req: Request<{ accountId: string }>, res: Response ) => {
	// Validate accountId path parameter
	const accountIdResult = validateAccountId( req.params.accountId );
	if ( !accountIdResult.success ) {
		return res.status( 400 ).json( { error: "Validation failed", details: accountIdResult.error } );
	}
	const accountId = accountIdResult.data;

	const account = await verifyAccount( accountId, res, 701 );
	if ( !account ) return;

	try {
		const contact = await getAccountContactById( accountId );

		if ( !contact ) {
			return res.status( 404 ).json( { code: 601, error: "An account with the provided account ID could not be found" } );
		}

		res.json( contact );
	} catch {
		logger.error( { accountId: sanitizeForLogging( accountId ) }, "Error retrieving account contact" );
		res.status( 500 ).json( { error: "Internal server error" } );
	}
} );

// GET /accounts/:accountId/statements with pagination support
router.get( "/accounts/:accountId/statements", async ( req: Request<{ accountId: string }>, res: Response ) => {
	// Validate accountId path parameter
	const accountIdResult = validateAccountId( req.params.accountId );
	if ( !accountIdResult.success ) {
		return res.status( 400 ).json( { error: "Validation failed", details: accountIdResult.error } );
	}
	const accountId = accountIdResult.data;

	// Validate query parameters including date range and pagination
	const queryResult = validateDateRangePagination( req.query );
	if ( !queryResult.success ) {
		return res.status( 400 ).json( { error: "Validation failed", details: queryResult.error } );
	}
	const { offset, limit, startTime, endTime } = queryResult.data;

	const account = await verifyAccount( accountId, res, 701 );
	if ( !account ) return;

	try {
		const result = await getAccountStatements( accountId, offset, limit, startTime || "", endTime || "" );

		// Calculate pagination metadata
		const hasMore = offset + limit < result.total;
		const page = hasMore ? { nextOffset: String( offset + limit ) } : {};

		// Construct response
		const response = {
			page,
			statements: result.statements
		};

		res.json( response );
	} catch {
		logger.error( { accountId: sanitizeForLogging( accountId ) }, "Error retrieving statements" );
		res.status( 500 ).json( { error: "Internal server error" } );
	}
} );

// GET /accounts/:accountId/statements/:statementId - simulate returning a PDF
router.get( "/accounts/:accountId/statements/:statementId", async ( req: Request<{ accountId: string; statementId: string }>, res: Response ) => {
	// Validate accountId path parameter
	const accountIdResult = validateAccountId( req.params.accountId );
	if ( !accountIdResult.success ) {
		return res.status( 400 ).json( { error: "Validation failed", details: accountIdResult.error } );
	}
	const accountId = accountIdResult.data;

	// Validate statementId path parameter
	const statementIdResult = validateStatementId( req.params.statementId );
	if ( !statementIdResult.success ) {
		return res.status( 400 ).json( { error: "Validation failed", details: statementIdResult.error } );
	}
	const statementId = statementIdResult.data;

	try {
		const account = await verifyAccount( accountId, res, 701 );
		if ( !account ) return;

		const statement = await getAccountStatementById( accountId, statementId );
		if ( !statement ) {
			return res.status( 404 ).json( { code: 601, error: "Statement not found for the provided accountId/statementId" } );
		}

		// Minimal valid PDF bytes: %PDF-1.4 ... %%EOF
		const pdfContent = "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n";
		const buffer = Buffer.from( pdfContent, "utf8" );

		res.setHeader( "Content-Type", "application/pdf" );
		res.setHeader( "Content-Disposition", `inline; filename=statement-${ statementId }.pdf` );
		res.setHeader( "Content-Length", buffer.length.toString() );
		return res.status( 200 ).send( buffer );
	} catch {
		logger.error( { accountId: sanitizeForLogging( accountId ), statementId: sanitizeForLogging( statementId ) }, "Error retrieving statement PDF" );
		return res.status( 500 ).json( { error: "Internal server error" } );
	}
} );

// GET /accounts/:accountId/transactions with pagination support
router.get( "/accounts/:accountId/transactions", async ( req: Request<{ accountId: string }>, res: Response ) => {
	// Validate accountId path parameter
	const accountIdResult = validateAccountId( req.params.accountId );
	if ( !accountIdResult.success ) {
		return res.status( 400 ).json( { error: "Validation failed", details: accountIdResult.error } );
	}
	const accountId = accountIdResult.data;

	// Validate query parameters including date range and pagination
	const queryResult = validateDateRangePagination( req.query );
	if ( !queryResult.success ) {
		return res.status( 400 ).json( { error: "Validation failed", details: queryResult.error } );
	}
	const { offset, limit, startTime, endTime } = queryResult.data;

	const account = await verifyAccount( accountId, res, 701 );
	if ( !account ) return;

	try {
		const result = await getAccountTransactions( accountId, offset, limit, startTime || "", endTime || "" );
		const hasMore = offset + limit < result.total;
		const page = hasMore ? { nextOffset: String( offset + limit ) } : {};
		return res.json( {
			page,
			transactions: result.transactions
		} );
	} catch {
		logger.error( { accountId: sanitizeForLogging( accountId ) }, "Error retrieving transactions" );
		return res.status( 500 ).json( { error: "Internal server error" } );
	}
} );

// GET /accounts/:accountId/payment-networks with pagination support
router.get( "/accounts/:accountId/payment-networks", async ( req: Request<{ accountId: string }>, res: Response ) => {
	// Validate accountId path parameter
	const accountIdResult = validateAccountId( req.params.accountId );
	if ( !accountIdResult.success ) {
		return res.status( 400 ).json( { error: "Validation failed", details: accountIdResult.error } );
	}
	const accountId = accountIdResult.data;

	// Validate pagination parameters with bounds checking
	const { offset, limit } = validatePagination( req.query );

	const account = await verifyAccount( accountId, res, 701 );
	if ( !account ) return;

	try {
		// Get accounts using the repository
		const result = await getPaymentNetworks( accountId, offset, limit );

		// Calculate pagination metadata
		const hasMore = offset + limit < result.total;
		const page = hasMore ? { nextOffset: String( offset + limit ) } : {};

		// Construct response
		const response = {
			page,
			paymentNetworks: result.paymentNetworks
		};

		res.json( response );
	} catch {
		logger.error( { accountId: sanitizeForLogging( accountId ) }, "Error retrieving payment networks" );
		res.status( 500 ).json( { error: "Internal server error" } );
	}
} );

// GET /accounts/:accountId/asset-transfer-networks with pagination support
router.get( "/accounts/:accountId/asset-transfer-networks", async ( req: Request<{ accountId: string }>, res: Response ) => {
	// Validate accountId path parameter
	const accountIdResult = validateAccountId( req.params.accountId );
	if ( !accountIdResult.success ) {
		return res.status( 400 ).json( { error: "Validation failed", details: accountIdResult.error } );
	}
	const accountId = accountIdResult.data;

	// Validate pagination parameters with bounds checking
	const { offset, limit } = validatePagination( req.query );

	const account = await verifyAccount( accountId, res, 701 );
	if ( !account ) return;

	try {
		const result = await getAssetTransferNetworks( accountId, offset, limit );
		const hasMore = offset + limit < result.total;
		const page = hasMore ? { nextOffset: String( offset + limit ) } : {};
		return res.json( {
			page,
			assetTransferNetworks: result.assetTransferNetworks
		} );
	} catch {
		logger.error( { accountId: sanitizeForLogging( accountId ) }, "Error retrieving asset transfer networks" );
		return res.status( 500 ).json( { error: "Internal server error" } );
	}
} );

export default router;
