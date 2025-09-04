import express, { Request, Response } from "express";
import { getCurrentCustomer } from "../data/customersRepository.js";

const router = express.Router();

// Get current customer
router.get( "/customers/current", async ( req: Request, res: Response ) => {
	try {
		// Get current customer using the repository
		const customer = await getCurrentCustomer();

		//HTTP status and error code are not always the same, check the API documentation for specifics
		if ( !customer ) {
			return res.status( 404 ).json( {
				code: 601,
				message: "A customer with the provided customer ID could not be found"
			} );
		}

		res.json( customer );
	} catch ( error ) {
		console.error( "Error retrieving current customer:", error );
		res.status( 500 ).json( { error: "Internal server error" } );
	}
} );

export default router;
