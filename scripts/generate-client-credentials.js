#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Generate random OAuth/OIDC client credentials
 *
 * Generates:
 * - Client ID: A URL-safe random string (32 characters)
 * - Client Secret: A cryptographically secure random string (64 characters)
 *
 * Usage:
 *   node scripts/generate-client-credentials.js
 *   node scripts/generate-client-credentials.js --prefix myapp
 */

import { randomBytes } from "crypto";

/**
 * Generate a URL-safe random string
 * @param {number} length - Desired length of the string
 * @returns {string} URL-safe random string
 */
function generateUrlSafeToken( length ) {
	return randomBytes( Math.ceil( length * 0.75 ) )
		.toString( "base64url" )
		.substring( 0, length );
}

/**
 * Generate a hex random string
 * @param {number} length - Desired length of the string
 * @returns {string} Hex random string
 */
function generateHexToken( length ) {
	return randomBytes( Math.ceil( length / 2 ) )
		.toString( "hex" )
		.substring( 0, length );
}

// Parse command line arguments
const args = process.argv.slice( 2 );
const prefixIndex = args.indexOf( "--prefix" );
const prefix = prefixIndex !== -1 && args[prefixIndex + 1]
	? args[prefixIndex + 1]
	: null;

// Generate credentials
const clientId = prefix
	? `${ prefix }-${ generateUrlSafeToken( 24 ) }`
	: generateUrlSafeToken( 32 );

const clientSecret = generateHexToken( 64 );

// Output
console.log( "═══════════════════════════════════════════════════════════════" );
console.log( "Generated OAuth/OIDC Client Credentials" );
console.log( "═══════════════════════════════════════════════════════════════" );
console.log();
console.log( "CLIENT_ID:" );
console.log( clientId );
console.log();
console.log( "CLIENT_SECRET:" );
console.log( clientSecret );
console.log();
console.log( "═══════════════════════════════════════════════════════════════" );
console.log( "⚠️  IMPORTANT: Store these securely and never commit to git!" );
console.log( "═══════════════════════════════════════════════════════════════" );
console.log();
console.log( "Add to your .env file:" );
console.log( `CLIENT_ID=${ clientId }` );
console.log( `CLIENT_SECRET=${ clientSecret }` );
console.log();
