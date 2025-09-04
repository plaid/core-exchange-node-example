// Mock customer data
export const customers = [
	{
		customerId: "customer-123",
		name: "Current Customer",
		email: "customer@example.com",
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
