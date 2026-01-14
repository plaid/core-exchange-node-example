/**
 * @apps/shared - Security utilities for OAuth educational project
 *
 * This package provides security utilities for handling errors, logging,
 * environment configuration, middleware, and other common functionality
 * across the OAuth monorepo.
 */

// Re-export all utilities
export * from "./security.js";
export * from "./environment.js";
export * from "./logging.js";
export * from "./middleware.js";
export * from "./validation.js";

// Version and metadata
export const version = "0.1.0";
export const description = "Shared utilities for OAuth educational project";
