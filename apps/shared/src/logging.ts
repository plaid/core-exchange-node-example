/**
 * Logging utilities and configurations
 */

import pino from "pino";
import { getOptionalEnv, getEnvBoolean } from "./environment.js";

/**
 * Standard logger configuration for development
 */
export const createDevelopmentLogger = () => pino( {
	transport: {
		target: "pino-pretty",
		options: {
			colorize: true
		}
	}
} );

/**
 * Standard logger configuration for production
 */
export const createProductionLogger = ( serviceName?: string ) => pino( {
	level: getOptionalEnv( "LOG_LEVEL", "info" ),
	...( serviceName && { name: serviceName } )
} );

/**
 * Create a logger based on environment
 * Uses pretty printing in development, structured logging in production
 */
export const createLogger = ( serviceName?: string ) => {
	const isDevelopment = process.env.NODE_ENV !== "production";

	if ( isDevelopment ) {
		return createDevelopmentLogger();
	}

	return createProductionLogger( serviceName );
};

/**
 * Logger with debug mode support
 */
export const createDebugLogger = ( serviceName?: string ) => {
	const logger = createLogger( serviceName );
	const isDebugMode = getEnvBoolean( "DEBUG", false );

	if ( isDebugMode ) {
		logger.level = "debug";
	}

	return logger;
};

/**
 * Default logger instance for the shared module
 */
export const logger = createLogger( "shared" );
