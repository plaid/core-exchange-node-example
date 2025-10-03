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
	},
	{
		accountCategory: "LOC_ACCOUNT",
		accountId: "account-601",
		accountNumberDisplay: "4532",
		productName: "Platinum Rewards Credit Card",
		status: "OPEN",
		currency: {
			currencyCode: "USD"
		},
		accountType: "CREDITCARD",
		currentBalance: 2845.50,  // Amount owed
		availableCredit: 17154.50,  // Available credit
		creditLine: 20000.00  // Credit limit
	},
	{
		accountCategory: "LOAN_ACCOUNT",
		accountId: "account-602",
		accountNumberDisplay: "9876",
		productName: "Home Mortgage Loan",
		status: "OPEN",
		currency: {
			currencyCode: "USD"
		},
		accountType: "MORTGAGE",
		accountNumber: "MORT-9876-2021",
		principalBalance: 285000.00,  // Amount owed (required)
		originalPrincipal: 320000.00,
		interestRate: 3.75,  // Required
		interestRateType: "FIXED",  // Required
		loanTerm: 360  // months
	},
	{
		accountCategory: "LOAN_ACCOUNT",
		accountId: "account-603",
		accountNumberDisplay: "1234",
		productName: "Auto Loan - 2022 Vehicle",
		status: "OPEN",
		currency: {
			currencyCode: "USD"
		},
		accountType: "AUTOLOAN",
		principalBalance: 18750.25,  // Amount owed (required)
		originalPrincipal: 32000.00,
		interestRate: 4.5,  // Required
		interestRateType: "FIXED"  // Required
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
				number: "3127771926",
				network: "LANDLINE"
			},
			{
				type: "PERSONAL",
				country: "1",
				number: "3129876543",
				network: "CELLULAR"
			},
			{
				type: "HOME",
				country: "1",
				number: "4157771926",
				network: "LANDLINE"
			}
		]
	},
	"account-456": {
		holders: [
			{
				relationship: "PRIMARY",
				name: {
					first: "Jane",
					middle: "Elizabeth",
					last: "Austen"
				}
			}
		],
		emails: [
			"jane.austen@domain.tld"
		],
		addresses: [
			{
				line1: "123 Main Street",
				city: "Austin",
				region: "TX",
				postalCode: "78701",
				country: "US"
			}
		],
		telephones: [
			{
				type: "PERSONAL",
				country: "1",
				number: "5125551234",
				network: "CELLULAR"
			}
		]
	},
	"account-789": {
		holders: [
			{
				relationship: "SOLE_OWNER",
				name: {
					first: "Mark",
					last: "Twain"
				}
			}
		],
		emails: [
			"mark.twain@domain.tld"
		],
		addresses: [
			{
				line1: "456 River Road",
				city: "Hartford",
				region: "CT",
				postalCode: "06103",
				country: "US"
			}
		],
		telephones: [
			{
				type: "HOME",
				country: "1",
				number: "8605559876",
				network: "LANDLINE"
			}
		]
	},
	"account-101": {
		holders: [
			{
				relationship: "PRIMARY",
				name: {
					first: "Virginia",
					last: "Woolf"
				}
			}
		],
		emails: [
			"virginia.woolf@domain.tld"
		],
		addresses: [
			{
				line1: "789 Bloomsbury Way",
				line2: "Unit 5B",
				city: "Seattle",
				region: "WA",
				postalCode: "98101",
				country: "US"
			}
		],
		telephones: [
			{
				type: "PERSONAL",
				country: "1",
				number: "2065554321",
				network: "CELLULAR"
			}
		]
	},
	"account-202": {
		holders: [
			{
				relationship: "PRIMARY_JOINT",
				name: {
					first: "F. Scott",
					last: "Fitzgerald"
				}
			},
			{
				relationship: "SECONDARY_JOINT",
				name: {
					first: "Zelda",
					last: "Fitzgerald"
				}
			}
		],
		emails: [
			"f.fitzgerald@domain.tld",
			"zelda.fitzgerald@domain.tld"
		],
		addresses: [
			{
				line1: "100 Park Avenue",
				line2: "Suite 2020",
				city: "New York",
				region: "NY",
				postalCode: "10017",
				country: "US"
			}
		],
		telephones: [
			{
				type: "HOME",
				country: "1",
				number: "2125556789",
				network: "LANDLINE"
			},
			{
				type: "PERSONAL",
				country: "1",
				number: "9175553456",
				network: "CELLULAR"
			}
		]
	},
	"account-303": {
		holders: [
			{
				relationship: "PRIMARY",
				name: {
					first: "Harper",
					last: "Lee"
				}
			}
		],
		emails: [
			"harper.lee@domain.tld"
		],
		addresses: [
			{
				line1: "321 Oak Street",
				city: "Monroeville",
				region: "AL",
				postalCode: "36460",
				country: "US"
			}
		],
		telephones: [
			{
				type: "HOME",
				country: "1",
				number: "2515557890",
				network: "LANDLINE"
			}
		]
	},
	"account-404": {
		holders: [
			{
				relationship: "PRIMARY",
				name: {
					first: "Toni",
					last: "Morrison"
				}
			}
		],
		emails: [
			"toni.morrison@domain.tld"
		],
		addresses: [
			{
				line1: "555 College Avenue",
				city: "Princeton",
				region: "NJ",
				postalCode: "08540",
				country: "US"
			}
		],
		telephones: [
			{
				type: "PERSONAL",
				country: "1",
				number: "6095552468",
				network: "CELLULAR"
			}
		]
	},
	"account-505": {
		holders: [
			{
				relationship: "PRIMARY",
				name: {
					first: "James",
					middle: "Arthur",
					last: "Baldwin"
				}
			}
		],
		emails: [
			"james.baldwin@domain.tld"
		],
		addresses: [
			{
				line1: "137 West 131st Street",
				city: "New York",
				region: "NY",
				postalCode: "10027",
				country: "US"
			}
		],
		telephones: [
			{
				type: "HOME",
				country: "1",
				number: "2125558642",
				network: "LANDLINE"
			}
		]
	},
	"account-601": {
		holders: [
			{
				relationship: "PRIMARY",
				name: {
					first: "Langston",
					last: "Hughes"
				}
			}
		],
		emails: [
			"langston.hughes@domain.tld"
		],
		addresses: [
			{
				line1: "20 East 127th Street",
				city: "New York",
				region: "NY",
				postalCode: "10035",
				country: "US"
			}
		],
		telephones: [
			{
				type: "PERSONAL",
				country: "1",
				number: "2125559988",
				network: "CELLULAR"
			}
		]
	},
	"account-602": {
		holders: [
			{
				relationship: "PRIMARY_JOINT",
				name: {
					first: "Willa",
					last: "Cather"
				}
			},
			{
				relationship: "SECONDARY_JOINT",
				name: {
					first: "Edith",
					last: "Lewis"
				}
			}
		],
		emails: [
			"willa.cather@domain.tld",
			"edith.lewis@domain.tld"
		],
		addresses: [
			{
				line1: "5 Bank Street",
				line2: "Apartment 8B",
				city: "New York",
				region: "NY",
				postalCode: "10014",
				country: "US"
			}
		],
		telephones: [
			{
				type: "HOME",
				country: "1",
				number: "2125553344",
				network: "LANDLINE"
			}
		]
	},
	"account-603": {
		holders: [
			{
				relationship: "SOLE_OWNER",
				name: {
					first: "Zora",
					middle: "Neale",
					last: "Hurston"
				}
			}
		],
		emails: [
			"zora.hurston@domain.tld"
		],
		addresses: [
			{
				line1: "1734 School Court Street",
				city: "Eatonville",
				region: "FL",
				postalCode: "32751",
				country: "US"
			}
		],
		telephones: [
			{
				type: "PERSONAL",
				country: "1",
				number: "4075556677",
				network: "CELLULAR"
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
