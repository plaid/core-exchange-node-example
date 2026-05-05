import express, { Response } from "express";
import { getCurrentCustomer } from "../data/customersRepository.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AuthenticatedRequest, getSubject } from "../utils/auth.js";
import { FDXErrors } from "../utils/errors.js";
import { createLogger } from "@apps/shared";

const logger = createLogger( "api:customers" );

const router = express.Router();

// Get current customer
router.get(
	"/customers/current",
	asyncHandler( async ( req: AuthenticatedRequest, res: Response ) => {
		const userId = getSubject( req );
		if ( !userId ) {
			logger.warn( "GET /customers/current - missing authenticated subject" );
			return res.status( 401 ).json( FDXErrors.insufficientScope( "Missing authenticated subject" ) );
		}

		const customer = await getCurrentCustomer( userId );
		if ( !customer ) {
			return res.status( 404 ).json( FDXErrors.customerNotFound() );
		}

		return res.json( customer );
	} )
);

export default router;
