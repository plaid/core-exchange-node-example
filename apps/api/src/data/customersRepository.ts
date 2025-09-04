import { customers } from "./customers.js";

// Type definitions
interface CustomerPreferences {
	notifications: boolean;
	twoFactorAuth: boolean;
}

interface Customer {
	customerId: string;
	name: string;
	email: string;
	status: string;
	createdDate: string;
	preferences: CustomerPreferences;
}

interface CustomerFilters {
	status?: string;
}

/**
 * Get the current customer (simulating a logged-in user)
 */
export async function getCurrentCustomer(): Promise<Customer | null> {
	// In a real implementation, this would use authentication context
	// For now, we'll just return the first customer as the "current" one

	// Simulate database query delay
	return new Promise<Customer | null>( ( resolve ) => {
		setTimeout( () => {
			const currentCustomer = customers.find( ( c: Customer ) => c.customerId === "customer-123" );
			resolve( currentCustomer || null );
		}, 75 ); // Simulate 75ms delay
	} );
}

/**
 * Get customer by ID
 */
export async function getCustomerById( customerId: string ): Promise<Customer | null> {
	// Simulate database query delay
	return new Promise<Customer | null>( ( resolve ) => {
		setTimeout( () => {
			const customer = customers.find( ( c: Customer ) => c.customerId === customerId );
			resolve( customer || null );
		}, 50 ); // Simulate 50ms delay
	} );
}

/**
 * Get all customers with optional filtering
 */
export async function getCustomers( filters: CustomerFilters = {} ): Promise<Customer[]> {
	// Simulate database query delay
	return new Promise<Customer[]>( ( resolve ) => {
		setTimeout( () => {
			let filteredCustomers = [ ...customers ];

			// Apply filters if provided
			if ( filters.status ) {
				filteredCustomers = filteredCustomers.filter( ( c: Customer ) => c.status === filters.status );
			}

			resolve( filteredCustomers );
		}, 100 ); // Simulate 100ms delay
	} );
}
