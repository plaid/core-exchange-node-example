// Mock data for accounts
export const accounts = [
	{
		accountCategory: "DEPOSIT_ACCOUNT",
		accountId: "account-123",
		accountNumberDisplay: "0123",
		productName: "Primary Checking",
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
		productName: "Emergency Fund",
		status: "OPEN",
		currency: {
			currencyCode: "USD"
		},
		accountType: "SAVINGS",
		currentBalance: 15720.42,
		availableBalance: 15720.42
	},
	{
		accountCategory: "CREDIT_ACCOUNT",
		accountId: "account-789",
		accountNumberDisplay: "0789",
		productName: "Travel Rewards Card",
		status: "OPEN",
		currency: {
			currencyCode: "USD"
		},
		accountType: "CREDIT_CARD",
		currentBalance: -452.12,
		availableBalance: -452.12
	},
	{
		accountCategory: "INVESTMENT_ACCOUNT",
		accountId: "account-101",
		accountNumberDisplay: "0101",
		productName: "Retirement Portfolio",
		status: "OPEN",
		currency: {
			currencyCode: "USD"
		},
		accountType: "INVESTMENT",
		currentBalance: 87325.96,
		availableBalance: 87325.96
	},
	{
		accountCategory: "DEPOSIT_ACCOUNT",
		accountId: "account-202",
		accountNumberDisplay: "0202",
		productName: "Joint Account",
		status: "OPEN",
		currency: {
			currencyCode: "USD"
		},
		accountType: "CHECKING",
		currentBalance: 4275.31,
		availableBalance: 4275.31
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
