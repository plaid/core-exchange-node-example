import { accounts, accountContacts, accountStatements, accountTransactions, accountPaymentNetworks } from "./accounts.js";

// Type definitions
interface Currency {
	currencyCode: string;
}

interface Account {
	accountCategory: string;
	accountId: string;
	accountNumberDisplay: string;
	productName: string;
	status: string;
	currency: Currency;
	accountType: string;
	currentBalance: number;
	availableBalance: number;
}

interface Name {
	first: string;
	middle?: string;
	last: string;
	suffix?: string;
}

interface Holder {
	relationship: string;
	name: Name;
}

interface Address {
	line1: string;
	line2?: string;
	city: string;
	region: string;
	postalCode: string;
	country: string;
}

interface Telephone {
	type: string;
	country: string;
	number: string;
}

interface AccountContact {
	holders: Holder[];
	emails: string[];
	addresses: Address[];
	telephones: Telephone[];
}

interface Link {
	href: string;
	rel: string;
	action: string;
	types: string[];
}

interface Statement {
	accountId: string;
	statementId: string;
	statementDate: string;
	description: string;
	links: Link[];
	status: string;
}

interface Transaction {
	accountCategory: string;
	transactionType: string;
	checkNumber?: number;
	payee?: string;
	transactionId: string;
	postedTimestamp: string;
	transactionTimestamp: string;
	description: string;
	debitCreditMemo: string;
	status: string;
	amount: number;
}

interface PaymentNetwork {
	bankId: string;
	identifier: string;
	type: string;
	transferIn: boolean;
	transferOut: boolean;
}

interface PaginatedAccountsResult {
	accounts: Account[];
	total: number;
}

interface PaginatedStatementsResult {
	statements: Statement[];
	total: number;
}

interface PaginatedTransactionsResult {
	transactions: Transaction[];
	total: number;
}

interface PaginatedPaymentNetworksResult {
	paymentNetworks: PaymentNetwork[];
	total: number;
}

interface PaginatedAssetTransferNetworksResult {
	assetTransferNetworks: PaymentNetwork[];
	total: number;
}

// Simulating async database operations with promises

/**
 * Get all accounts with pagination support
 */
export async function getAccounts( offset = 0, limit = 10 ): Promise<PaginatedAccountsResult> {
	// Simulate database query delay
	return new Promise<PaginatedAccountsResult>( ( resolve ) => {
		setTimeout( () => {
			const paginatedAccounts = accounts.slice( offset, offset + limit );
			resolve( {
				accounts: paginatedAccounts,
				total: accounts.length
			} );
		}, 100 ); // Simulate 100ms delay
	} );
}

export async function getAccountById( accountId: string ): Promise<Account | null> {
	// Simulate database query delay
	return new Promise<Account | null>( ( resolve ) => {
		setTimeout( () => {
			const account = accounts.find( ( acc: Account ) => acc.accountId === accountId );
			resolve( account || null );
		}, 50 ); // Simulate 50ms delay
	} );
}

/**
 * Get account contact information by account ID
 */
export async function getAccountContactById( accountId: string ): Promise<AccountContact | null> {
	// Simulate database query delay
	return new Promise<AccountContact | null>( ( resolve ) => {
		setTimeout( () => {
			const contactInfo = ( accountContacts as Record<string, AccountContact> )[accountId];
			resolve( contactInfo || null );
		}, 50 ); // Simulate 50ms delay
	} );
}

/**
 * Get account statements with pagination and optional time filtering
 */
export async function getAccountStatements( accountId: string, offset = 0, limit = 100, startTime = "", endTime = "" ): Promise<PaginatedStatementsResult> {
	return new Promise<PaginatedStatementsResult>( ( resolve ) => {
		setTimeout( () => {
			const startDate = startTime ? new Date( startTime ) : new Date( 0 );
			const endDate = endTime ? new Date( endTime ) : new Date( 8640000000000000 ); // Max date

			// Filter statements by startTime and endTime (assumes validated in route)
			const statementsForAccount = ( accountStatements as Record<string, Statement[]> )[accountId] || [];
			const statements = statementsForAccount.filter( ( statement: Statement ) => {
				const statementDate = new Date( statement.statementDate );
				return statementDate >= startDate && statementDate <= endDate;
			} );
			const paginatedStatements = statements.slice( offset, offset + limit );
			resolve( {
				statements: paginatedStatements,
				total: statements.length
			} );
		}, 100 ); // Simulate 100ms delay
	} );
}

/**
 * Get a single account statement by ID
 */
export async function getAccountStatementById( accountId: string, statementId: string ): Promise<Statement | null> {
	return new Promise<Statement | null>( ( resolve ) => {
		setTimeout( () => {
			const statementsForAccount = ( accountStatements as Record<string, Statement[]> )[accountId] || [];
			const statement = statementsForAccount.find( ( s: Statement ) => s.statementId === statementId ) || null;
			resolve( statement );
		}, 50 );
	} );
}

/**
 * Get account transactions with pagination and optional time filtering
 */
export async function getAccountTransactions( accountId: string, offset = 0, limit = 100, startTime = "", endTime = "" ): Promise<PaginatedTransactionsResult> {
	return new Promise<PaginatedTransactionsResult>( ( resolve ) => {
		setTimeout( () => {
			const startDate = startTime ? new Date( startTime ) : new Date( 0 );
			const endDate = endTime ? new Date( endTime ) : new Date( 8640000000000000 );
			const transactionsForAccount = ( accountTransactions as Record<string, Transaction[]> )[accountId] || [];
			const filtered = transactionsForAccount.filter( ( tx: Transaction ) => {
				const txDate = new Date( tx.postedTimestamp );
				return txDate >= startDate && txDate <= endDate;
			} );
			const paginated = filtered.slice( offset, offset + limit );
			resolve( {
				transactions: paginated,
				total: filtered.length
			} );
		}, 100 );
	} );
}

/**
 * Get payment networks for an account with pagination
 */
export async function getPaymentNetworks( accountId: string, offset = 0, limit = 100 ): Promise<PaginatedPaymentNetworksResult> {
	return new Promise<PaginatedPaymentNetworksResult>( ( resolve ) => {
		setTimeout( () => {
			const networks = ( accountPaymentNetworks as Record<string, PaymentNetwork[]> )[accountId] || [];
			const paginated = networks.slice( offset, offset + limit );
			resolve( { paymentNetworks: paginated, total: networks.length } );
		}, 100 );
	} );
}

/**
 * Get asset transfer networks for an account with pagination
 * Reuses the same mock dataset as payment networks for this demo.
 */
export async function getAssetTransferNetworks( accountId: string, offset = 0, limit = 100 ): Promise<PaginatedAssetTransferNetworksResult> {
	return new Promise<PaginatedAssetTransferNetworksResult>( ( resolve ) => {
		setTimeout( () => {
			const networks = ( accountPaymentNetworks as Record<string, PaymentNetwork[]> )[accountId] || [];
			const paginated = networks.slice( offset, offset + limit );
			resolve( { assetTransferNetworks: paginated, total: networks.length } );
		}, 100 );
	} );
}
