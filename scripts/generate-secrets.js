#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Generate secure secrets for OAuth configuration
 * Run: node scripts/generate-secrets.js
 */

import { randomBytes } from "crypto";

function generateSecret( length = 32 ) {
	return randomBytes( length ).toString( "hex" );
}

console.log( "🔐 Generated Secure Secrets for OAuth Configuration\n" );
console.log( "Copy these values to your .env file:\n" );

console.log( "# OAuth Client Secret (64 characters)" );
console.log( `CLIENT_SECRET=${ generateSecret( 32 ) }\n` );

console.log( "# Cookie Secret (64 characters)" );
console.log( `COOKIE_SECRET=${ generateSecret( 32 ) }\n` );

console.log( "# Optional: Additional secrets for production" );
console.log( `# HEALTH_CHECK_TOKEN=${ generateSecret( 16 ) }` );
console.log( `# SESSION_SECRET=${ generateSecret( 32 ) }` );

console.log( "\n⚠️  SECURITY WARNING:" );
console.log( "• Never commit these secrets to version control" );
console.log( "• Store production secrets in secure environment variables" );
console.log( "• Rotate secrets regularly in production" );
console.log( "• Use different secrets for each environment\n" );
