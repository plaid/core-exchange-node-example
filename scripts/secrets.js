#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Core Exchange Secrets Manager
 *
 * A unified CLI tool for generating secure secrets and OAuth client credentials
 *
 * Usage:
 *   node scripts/secrets.js client [--prefix PREFIX]
 *   node scripts/secrets.js secrets
 *   node scripts/secrets.js all [--prefix PREFIX]
 *   node scripts/secrets.js --help
 */

import { randomBytes } from "crypto";

/**
 * Generate a URL-safe random string (for client IDs)
 * @param {number} length - Desired length of the string
 * @returns {string} URL-safe random string
 */
function generateUrlSafeToken( length ) {
	return randomBytes( Math.ceil( length * 0.75 ) )
		.toString( "base64url" )
		.substring( 0, length );
}

/**
 * Generate a hex random string (for secrets)
 * @param {number} length - Desired length of the string
 * @returns {string} Hex random string
 */
function generateHexToken( length ) {
	return randomBytes( Math.ceil( length / 2 ) )
		.toString( "hex" )
		.substring( 0, length );
}

/**
 * Generate OAuth client credentials
 * @param {string|null} prefix - Optional prefix for client ID
 */
function generateClientCredentials( prefix = null ) {
	const clientId = prefix
		? `${ prefix }-${ generateUrlSafeToken( 24 ) }`
		: generateUrlSafeToken( 32 );

	const clientSecret = generateHexToken( 64 );

	console.log( "═══════════════════════════════════════════════════════════════" );
	console.log( "OAuth/OIDC Client Credentials" );
	console.log( "═══════════════════════════════════════════════════════════════" );
	console.log();
	console.log( "CLIENT_ID:" );
	console.log( clientId );
	console.log();
	console.log( "CLIENT_SECRET:" );
	console.log( clientSecret );
	console.log();

	return { clientId, clientSecret };
}

/**
 * Generate application secrets
 */
function generateSecrets() {
	const cookieSecret = generateHexToken( 64 );

	console.log( "═══════════════════════════════════════════════════════════════" );
	console.log( "Application Secrets" );
	console.log( "═══════════════════════════════════════════════════════════════" );
	console.log();
	console.log( "# Cookie Secret (64 characters)" );
	console.log( `COOKIE_SECRET=${ cookieSecret }` );
	console.log();

	return { cookieSecret };
}

/**
 * Generate all credentials and secrets
 * @param {string|null} prefix - Optional prefix for client ID
 */
function generateAll( prefix = null ) {
	const client = generateClientCredentials( prefix );
	console.log();
	const secrets = generateSecrets();

	console.log( "═══════════════════════════════════════════════════════════════" );
	console.log( "Complete .env Configuration" );
	console.log( "═══════════════════════════════════════════════════════════════" );
	console.log();
	console.log( `CLIENT_ID=${ client.clientId }` );
	console.log( `CLIENT_SECRET=${ client.clientSecret }` );
	console.log( `COOKIE_SECRET=${ secrets.cookieSecret }` );
	console.log();
}

/**
 * Show help message
 */
function showHelp() {
	console.log( `
Core Exchange Secrets Manager

A unified CLI tool for generating secure secrets and OAuth client credentials.

USAGE:
  node scripts/secrets.js <command> [options]

COMMANDS:
  client [--prefix PREFIX]    Generate OAuth client credentials (CLIENT_ID, CLIENT_SECRET)
  secrets                     Generate application secrets (COOKIE_SECRET, etc.)
  all [--prefix PREFIX]       Generate both client credentials and secrets
  --help, -h                  Show this help message

OPTIONS:
  --prefix PREFIX             Add a prefix to the generated CLIENT_ID (e.g., "myapp")

EXAMPLES:
  # Generate only client credentials
  node scripts/secrets.js client

  # Generate client credentials with a custom prefix
  node scripts/secrets.js client --prefix myapp

  # Generate only application secrets
  node scripts/secrets.js secrets

  # Generate everything at once
  node scripts/secrets.js all

  # Generate everything with a custom client ID prefix
  node scripts/secrets.js all --prefix production

SECURITY NOTES:
  • Never commit generated secrets to version control
  • Store production secrets in secure environment variables or secret managers
  • Rotate secrets regularly in production environments
  • Use different secrets for each environment (dev, staging, production)
` );
}

/**
 * Show security warning footer
 */
function showSecurityWarning() {
	console.log( "═══════════════════════════════════════════════════════════════" );
	console.log( "⚠️  SECURITY WARNING" );
	console.log( "═══════════════════════════════════════════════════════════════" );
	console.log( "• Never commit these secrets to version control" );
	console.log( "• Store production secrets in secure environment variables" );
	console.log( "• Rotate secrets regularly in production" );
	console.log( "• Use different secrets for each environment" );
	console.log( "═══════════════════════════════════════════════════════════════" );
	console.log();
}

// Parse command line arguments
const args = process.argv.slice( 2 );
const command = args[0];

// Extract options
const prefixIndex = args.indexOf( "--prefix" );
const prefix = prefixIndex !== -1 && args[prefixIndex + 1]
	? args[prefixIndex + 1]
	: null;

// Route to appropriate command
switch ( command ) {
case "client":
	generateClientCredentials( prefix );
	showSecurityWarning();
	break;

case "secrets":
	generateSecrets();
	showSecurityWarning();
	break;

case "all":
	generateAll( prefix );
	showSecurityWarning();
	break;

case "--help":
case "-h":
case "help":
	showHelp();
	break;

default:
	console.error( `Error: Unknown command "${ command || "(none)" }"\n` );
	showHelp();
	process.exit( 1 );
}
