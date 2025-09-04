import express, { Request, Response } from "express";
import { getAccounts, getAccountById, getAccountContactById, getAccountStatements, getAccountStatementById, getAccountTransactions, getPaymentNetworks, getAssetTransferNetworks } from "../data/accountsRepository.js";
import { isValidDate } from "../utils/validation.js";

const router = express.Router();

interface AccountsQueryParams {
	offset?: string;
	limit?: string;
}

interface AccountStatementsQueryParams {
	offset?: string;
	limit?: string;
	startTime?: string;
	endTime?: string;
}

interface AccountTransactionsQueryParams {
	offset?: string;
	limit?: string;
	startTime?: string;
	endTime?: string;
}

interface PaymentNetworksQueryParams {
	offset?: string;
	limit?: string;
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
		console.error( "Error validating account:", error );
		res.status( 500 ).json( { error: "Internal server error" } );
		return null;
	}
}

// GET /accounts with pagination support
router.get( "/accounts", async ( req: Request<{}, {}, {}, AccountsQueryParams>, res: Response ) => {
	// Extract pagination parameters from query string with defaults
	const offset = parseInt( req.query.offset as string ) || 0;
	const limit = parseInt( req.query.limit as string ) || 100;

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
		console.error( "Error retrieving accounts:", error );
		res.status( 500 ).json( { error: "Internal server error" } );
	}
} );

router.get( "/accounts/:accountId", async ( req: Request<{ accountId: string }>, res: Response ) => {
	const { accountId } = req.params;

	try {
		const account = await getAccountById( accountId );

		if ( !account ) {
			return res.status( 404 ).json( { code: 701, error: "An account with the provided account ID could not be found" } );
		}

		res.json( account );
	} catch ( error ) {
		console.error( "Error retrieving account:", error );
		res.status( 500 ).json( { error: "Internal server error" } );
	}
} );

router.get( "/accounts/:accountId/contact", async ( req: Request<{ accountId: string }>, res: Response ) => {
	const { accountId } = req.params;

	const account = await verifyAccount( accountId, res, 701 );
	if ( !account ) return;

	try {
		const contact = await getAccountContactById( accountId );

		if ( !contact ) {
			return res.status( 404 ).json( { code: 601, error: "An account with the provided account ID could not be found" } );
		}

		res.json( contact );
	} catch ( error ) {
		console.error( "Error retrieving account contact:", error );
		res.status( 500 ).json( { error: "Internal server error" } );
	}
} );

// GET /accounts/:accountId/statements with pagination support
router.get( "/accounts/:accountId/statements", async ( req: Request<{ accountId: string }, {}, {}, AccountStatementsQueryParams>, res: Response ) => {
	// Extract params and pagination from query string with defaults
	const { accountId } = req.params;
	const offset = parseInt( req.query.offset as string ) || 0;
	const limit = parseInt( req.query.limit as string ) || 100;
	const startTime = req.query.startTime || "";
	const endTime = req.query.endTime || "";

	const account = await verifyAccount( accountId, res, 701 );
	if ( !account ) return;

	if ( !isValidDate( startTime ) || !isValidDate( endTime ) ) {
		return res.status( 400 ).json( { error: "Invalid date format for startTime or endTime" } );
	}

	if ( startTime && endTime && new Date( startTime ) > new Date( endTime ) ) {
		return res.status( 400 ).json( { error: "startTime must be before or equal to endTime" } );
	}

	try {
		const result = await getAccountStatements( accountId, offset, limit, startTime, endTime );

		// Calculate pagination metadata
		const hasMore = offset + limit < result.total;
		const page = hasMore ? { nextOffset: String( offset + limit ) } : {};

		// Construct response
		const response = {
			page,
			statements: result.statements
		};

		res.json( response );
	} catch ( error ) {
		console.error( "Error retrieving accounts:", error );
		res.status( 500 ).json( { error: "Internal server error" } );
	}
} );

// GET /accounts/:accountId/statements/:statementId - simulate returning a PDF
router.get( "/accounts/:accountId/statements/:statementId", async ( req: Request<{ accountId: string; statementId: string }>, res: Response ) => {
	const { accountId, statementId } = req.params;

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
	} catch ( error ) {
		console.error( "Error retrieving statement PDF:", error );
		return res.status( 500 ).json( { error: "Internal server error" } );
	}
} );

// GET /accounts/:accountId/transactions with pagination support
router.get( "/accounts/:accountId/transactions", async ( req: Request<{ accountId: string }, {}, {}, AccountTransactionsQueryParams>, res: Response ) => {
	const { accountId } = req.params;
	const offset = parseInt( req.query.offset as string ) || 0;
	const limit = parseInt( req.query.limit as string ) || 100;
	const startTime = req.query.startTime || "";
	const endTime = req.query.endTime || "";

	const account = await verifyAccount( accountId, res, 701 );
	if ( !account ) return;

	if ( !isValidDate( startTime ) || !isValidDate( endTime ) ) {
		return res.status( 400 ).json( { error: "Invalid date format for startTime or endTime" } );
	}

	if ( startTime && endTime && new Date( startTime ) > new Date( endTime ) ) {
		return res.status( 400 ).json( { error: "startTime must be before or equal to endTime" } );
	}

	try {
		const result = await getAccountTransactions( accountId, offset, limit, startTime, endTime );
		const hasMore = offset + limit < result.total;
		const page = hasMore ? { nextOffset: String( offset + limit ) } : {};
		return res.json( {
			page,
			transactions: result.transactions
		} );
	} catch ( error ) {
		console.error( "Error retrieving transactions:", error );
		return res.status( 500 ).json( { error: "Internal server error" } );
	}
} );

// GET /accounts/:accountId/payment-networks with pagination support
router.get( "/accounts/:accountId/payment-networks", async ( req: Request<{ accountId: string }, {}, {}, PaymentNetworksQueryParams>, res: Response ) => {
	const { accountId } = req.params;
	const offset = parseInt( req.query.offset as string ) || 0;
	const limit = parseInt( req.query.limit as string ) || 100;

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
	} catch ( error ) {
		console.error( "Error retrieving accounts:", error );
		res.status( 500 ).json( { error: "Internal server error" } );
	}
} );

// GET /accounts/:accountId/asset-transfer-networks with pagination support
router.get( "/accounts/:accountId/asset-transfer-networks", async ( req: Request<{ accountId: string }, {}, {}, PaymentNetworksQueryParams>, res: Response ) => {
	const { accountId } = req.params;
	const offset = parseInt( req.query.offset as string ) || 0;
	const limit = parseInt( req.query.limit as string ) || 100;

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
	} catch ( error ) {
		console.error( "Error retrieving asset transfer networks:", error );
		return res.status( 500 ).json( { error: "Internal server error" } );
	}
} );

export default router;
