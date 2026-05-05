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
 * Get the current customer for an authenticated user.
 *
 * The `userId` argument should be the verified JWT subject (`sub` claim) of
 * the authenticated request. The repository looks up the customer record
 * keyed on this id; never trust unauthenticated input here.
 */
export async function getCurrentCustomer( userId: string ): Promise<Customer | null> {
	// Simulate database query delay
	return new Promise<Customer | null>( ( resolve ) => {
		setTimeout( () => {
			const currentCustomer = customers.find( ( c: Customer ) => c.customerId === userId );
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
