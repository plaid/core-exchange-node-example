/**
 * Express middleware utilities
 */

import helmet, { HelmetOptions } from "helmet";
import type { RequestHandler } from "express";

/**
 * Security headers configuration for API services
 */
export const createApiSecurityHeaders = (): RequestHandler => {
	return helmet( {
		contentSecurityPolicy: {
			directives: {
				defaultSrc: [ "'self'" ],
				connectSrc: [ "'self'" ]
			}
		},
		crossOriginEmbedderPolicy: false
	} );
};

/**
 * Security headers configuration for web applications with templates
 */
export const createWebSecurityHeaders = ( apiBaseUrl?: string ): RequestHandler => {
	const isProduction = process.env.NODE_ENV === "production";

	return helmet( {
		// Allow inline scripts and styles for EJS templates in development
		// In production, consider using nonces or CSP hashes
		contentSecurityPolicy: isProduction ? {
			useDefaults: false, // Don't use helmet defaults to have full control
			directives: {
				defaultSrc: [ "'self'" ],
				styleSrc: [ "'self'", "'unsafe-inline'" ], // Allow inline styles for Tailwind
				scriptSrc: [ "'self'", "'unsafe-inline'" ], // Allow inline scripts for EJS templates
				imgSrc: [ "'self'", "data:", "https:" ],
				connectSrc: apiBaseUrl ? [ "'self'", apiBaseUrl ] : [ "'self'" ],
				fontSrc: [ "'self'" ],
				objectSrc: [ "'none'" ],
				mediaSrc: [ "'self'" ],
				frameSrc: [ "'none'" ],
				baseUri: [ "'self'" ],
				upgradeInsecureRequests: []
				// Omit form-action entirely - without defaults, helmet won't add it
			}
		} : false, // Disable CSP in development for easier debugging
		crossOriginEmbedderPolicy: false // Allow iframe usage if needed
	} );
};

/**
 * Create custom helmet configuration
 */
export const createCustomSecurityHeaders = ( options: HelmetOptions ): RequestHandler => {
	return helmet( options );
};

/**
 * Common Express app setup utilities
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const setupBasicExpress = ( app: any ) => {
	// Disable x-powered-by header
	app.disable( "x-powered-by" );

	// Trust proxy headers (for HTTPS detection behind reverse proxy)
	app.set( "trust proxy", true );
};

/**
 * Setup EJS template engine
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const setupEJSTemplates = ( app: any, viewsPath: string ) => {
	app.set( "view engine", "ejs" );
	app.set( "views", viewsPath );
};

/**
 * Setup static file serving
 * Note: Pass express.static as staticHandler from the calling app
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const setupStaticFiles = ( app: any, staticHandler: any, staticPath: string, urlPath = "/public" ) => {
	app.use( urlPath, staticHandler( staticPath ) );
};
