// Mock data for accounts
export const accounts = [
	{
		accountCategory: "DEPOSIT_ACCOUNT",
		accountId: "account-123",
		accountNumberDisplay: "0123",
		productName: "Everyday Checking",
		status: "OPEN",
		currency: {
			currencyCode: "USD"
		},
		accountType: "CHECKING",
		currentBalance: 2549.75,
		availableBalance: 2549.75
	},
	{
		accountCategory: "DEPOSIT_ACCOUNT",
		accountId: "account-456",
		accountNumberDisplay: "0456",
		productName: "High-Yield Savings",
		status: "OPEN",
		currency: {
			currencyCode: "USD"
		},
		accountType: "HIGHINTERESTSAVINGSACCOUNT",
		currentBalance: 25340.87,
		availableBalance: 25340.87
	},
	{
		accountCategory: "DEPOSIT_ACCOUNT",
		accountId: "account-789",
		accountNumberDisplay: "0789",
		productName: "12-Month CD",
		status: "OPEN",
		currency: {
			currencyCode: "USD"
		},
		accountType: "CD",
		currentBalance: 50000.00,
		availableBalance: 0.00
	},
	{
		accountCategory: "DEPOSIT_ACCOUNT",
		accountId: "account-101",
		accountNumberDisplay: "0101",
		productName: "Home Purchase Escrow",
		status: "OPEN",
		currency: {
			currencyCode: "USD"
		},
		accountType: "ESCROW",
		currentBalance: 8750.00,
		availableBalance: 8750.00
	},
	{
		accountCategory: "DEPOSIT_ACCOUNT",
		accountId: "account-202",
		accountNumberDisplay: "0202",
		productName: "Premier Money Market",
		status: "OPEN",
		currency: {
			currencyCode: "USD"
		},
		accountType: "MONEYMARKET",
		currentBalance: 75420.55,
		availableBalance: 75420.55
	},
	{
		accountCategory: "DEPOSIT_ACCOUNT",
		accountId: "account-303",
		accountNumberDisplay: "0303",
		productName: "Emergency Fund Savings",
		status: "OPEN",
		currency: {
			currencyCode: "USD"
		},
		accountType: "SAVINGS",
		currentBalance: 12500.00,
		availableBalance: 12500.00
	},
	{
		accountCategory: "DEPOSIT_ACCOUNT",
		accountId: "account-404",
		accountNumberDisplay: "0404",
		productName: "First Home Saver",
		status: "OPEN",
		currency: {
			currencyCode: "USD"
		},
		accountType: "FIRSTHOMESAVINGSACCOUNT",
		currentBalance: 18900.25,
		availableBalance: 18900.25
	},
	{
		accountCategory: "DEPOSIT_ACCOUNT",
		accountId: "account-505",
		accountNumberDisplay: "0505",
		productName: "Club Account",
		status: "OPEN",
		currency: {
			currencyCode: "USD"
		},
		accountType: "OTHERDEPOSIT",
		currentBalance: 3250.00,
		availableBalance: 3250.00
	}
];

// Mock data for account contacts
export const accountContacts = {
	"account-123": {
		holders: [
			{
				relationship: "SECONDARY",
				name: {
					first: "Ernest",
					middle: "Miller",
					last: "Hemingway",
					suffix: "IV"
				}
			},
			{
				relationship: "PRIMARY_JOINT",
				name: {
					first: "Maya",
					last: "Angelou",
					middle: "Annie"
				}
			}
		],
		emails: [
			"ernest.m.hemingway@domain.tld",
			"m.angelou@domain.tld"
		],
		addresses: [
			{
				line1: "1850 N Clark St",
				line2: "Apartment 103",
				city: "Chicago",
				region: "IL",
				postalCode: "60614",
				country: "US"
			},
			{
				line1: "2014 N Main St",
				city: "San Francisco",
				region: "CA",
				postalCode: "94105",
				country: "US"
			}
		],
		telephones: [
			{
				type: "HOME",
				country: "1",
				number: "3127771926"
			},
			{
				type: "CELL",
				country: "53",
				number: "45915607"
			},
			{
				type: "HOME",
				country: "1",
				number: "4157771926"
			}
		]
	}
};

// Mock data for account statements
export const accountStatements = {
	"account-123": [
		{
			accountId: "account-123",
			statementId: "20001",
			statementDate: "2024-01-15",
			description: "January 2024 Monthly Statement",
			links: [
				{
					href: "/accounts/10001/statements/20001",
					rel: "self",
					action: "GET",
					types: [
						"application/pdf"
					]
				},
				{
					href: "/accounts/10001/statements/20001/download",
					rel: "download",
					action: "GET",
					types: [
						"application/pdf"
					]
				}
			],
			status: "AVAILABLE"
		},
		{
			accountId: "10001",
			statementId: "20002",
			statementDate: "2024-02-15",
			description: "February 2024 Monthly Statement",
			links: [
				{
					href: "/accounts/10001/statements/20002",
					rel: "self",
					action: "GET",
					types: [
						"application/pdf"
					]
				}
			],
			status: "PROCESSING"
		}
	]
};

// Mock data for account transactions
export const accountTransactions = {
	"account-123": [
		{
			accountCategory: "DEPOSIT_ACCOUNT",
			transactionType: "CHECK",
			checkNumber: 1234,
			payee: "ACME LLC",
			transactionId: "depositTransaction000000001",
			postedTimestamp: "2022-04-06T00:00:00.000Z",
			transactionTimestamp: "2022-04-05T00:00:00.000Z",
			description: "check for latest ACME invoice",
			debitCreditMemo: "DEBIT",
			status: "PENDING",
			amount: 400
		},
		{
			accountCategory: "DEPOSIT_ACCOUNT",
			transactionType: "ADJUSTMENT",
			transactionId: "depositTransaction000000002",
			postedTimestamp: "2022-04-07T00:00:00.000Z",
			transactionTimestamp: "2022-04-07T00:00:00.000Z",
			description: "reconciliation/adjustment of bank statement error",
			debitCreditMemo: "DEBIT",
			status: "POSTED",
			amount: 0.8
		},
		{
			accountCategory: "DEPOSIT_ACCOUNT",
			transactionType: "ATMDEPOSIT",
			transactionId: "depositTransaction000000003",
			postedTimestamp: "2022-04-08T00:00:00.000Z",
			transactionTimestamp: "2022-04-08T00:00:00.000Z",
			description: "ATM cash deposit location #1234",
			debitCreditMemo: "CREDIT",
			status: "POSTED",
			amount: 101.8
		}
	],
	"account-456": [
		{
			accountCategory: "DEPOSIT_ACCOUNT",
			transactionType: "ATMDEPOSIT",
			transactionId: "depositTransaction000000003",
			postedTimestamp: "2022-04-08T00:00:00.000Z",
			transactionTimestamp: "2022-04-08T00:00:00.000Z",
			description: "ATM cash deposit location #1234",
			debitCreditMemo: "CREDIT",
			status: "POSTED",
			amount: 101.8
		}
	]
};

// Mock data for account payment networks
export const accountPaymentNetworks = {
	"account-123": [
		{
			bankId: "010088889",
			identifier: "1111222233335820",
			type: "US_ACH",
			transferIn: true,
			transferOut: true
		}
	]
};
