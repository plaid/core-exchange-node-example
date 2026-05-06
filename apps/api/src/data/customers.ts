// Mock customer data.
//
// The first record's `customerId` is intentionally set to the demo user's
// OIDC `sub` claim ("user_123" — see apps/auth/src/index.ts USERS map) so the
// resource server can resolve an authenticated user to their customer record
// using the JWT subject directly.
export const customers = [
	{
		customerId: "user_123",
		name: "Dev User",
		email: "user@example.test",
		status: "active",
		createdDate: "2021-05-15",
		preferences: {
			notifications: true,
			twoFactorAuth: true
		}
	},
	{
		customerId: "customer-456",
		name: "Jane Smith",
		email: "jane.smith@example.com",
		status: "active",
		createdDate: "2020-11-22",
		preferences: {
			notifications: false,
			twoFactorAuth: true
		}
	},
	{
		customerId: "customer-789",
		name: "John Doe",
		email: "john.doe@example.com",
		status: "inactive",
		createdDate: "2019-03-10",
		preferences: {
			notifications: true,
			twoFactorAuth: false
		}
	}
];
