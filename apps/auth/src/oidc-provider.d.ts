/**
 * Minimal type declarations for `oidc-provider` v9.x.
 *
 * The upstream package does not currently ship its own types, and the
 * community-maintained `@types/oidc-provider` only covers v8 APIs that no
 * longer match what we use. We declare narrow shapes for just the pieces of
 * the provider surface that this app actually touches so we can avoid
 * `any` while keeping the declaration footprint small.
 *
 * Parameter names below are documentation-only (declarations have no body),
 * so silence the unused-name lint that would otherwise fire on every method.
 */
/* eslint-disable no-unused-vars */
declare module "oidc-provider" {
	import type { IncomingMessage, ServerResponse } from "http";

	export interface OIDCInteractionPrompt {
		name: string;
		details?: Record<string, unknown>;
	}

	export interface OIDCInteractionDetails {
		uid: string;
		prompt: OIDCInteractionPrompt;
		params: Record<string, unknown>;
		session?: { accountId?: string };
		grantId?: string;
	}

	export interface OIDCInteractionResult {
		login?: { accountId: string };
		consent?: { grantId: string };
	}

	export interface OIDCGrantInstance {
		addOIDCScope( scope: string ): void;
		addOIDCClaims( claims: string[] ): void;
		addResourceScope( resource: string, scope: string ): void;
		save(): Promise<string>;
	}

	export interface OIDCGrantConstructor {
		new ( props: { accountId: string; clientId: string } ): OIDCGrantInstance;
		find( grantId: string ): Promise<OIDCGrantInstance>;
	}

	export interface OIDCClient {
		clientId: string;
		client_id?: string;
		grantTypeAllowed( grantType: string ): boolean;
	}

	export interface OIDCAuthorizationCode {
		scopes: Set<string>;
	}

	export class Provider {
		constructor( issuer: string, configuration?: unknown );
		proxy: boolean;
		// `callback()` returns a Node.js style request handler that works both
		// as Express middleware and when invoked directly with (req, res).
		callback(): ( req: IncomingMessage, res: ServerResponse, next?: ( err?: unknown ) => void ) => void;
		interactionDetails( req: IncomingMessage, res: ServerResponse ): Promise<OIDCInteractionDetails>;
		interactionResult(
			req: IncomingMessage,
			res: ServerResponse,
			result: OIDCInteractionResult,
			options?: { mergeWithLastSubmission?: boolean }
		): Promise<string>;
		Grant: OIDCGrantConstructor;
	}

	export const errors: {
		OIDCProviderError: ErrorConstructor;
		[key: string]: ErrorConstructor;
	};
}
