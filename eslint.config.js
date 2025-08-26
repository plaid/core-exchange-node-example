import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import globals from "globals";
import stylistic from "@stylistic/eslint-plugin";

// Common language options
const commonLanguageOptions = {
	ecmaVersion: 2022,
	sourceType: "module",
	globals: {
		...globals.node,
		...globals.es2022
	}
};

// Common rules for all file types
const commonRules = {
	"no-console": "warn",
	"prefer-const": "error",
	"no-var": "error"
};

// Common stylistic rules
const commonStylisticRules = {
	"@stylistic/array-bracket-spacing": [ "error", "always", { singleValue: true } ],
	"@stylistic/comma-dangle": [ "error", "never" ],
	"@stylistic/comma-spacing": [ "error", { before: false, after: true } ],
	"@stylistic/eol-last": [ "error", "always" ],
	"@stylistic/indent": [ "error", "tab" ],
	"@stylistic/linebreak-style": [ "error", "unix" ],
	"@stylistic/no-multiple-empty-lines": [ "error", { max: 1 } ],
	"@stylistic/no-trailing-spaces": [ "error" ],
	"@stylistic/object-curly-spacing": [ "error", "always" ],
	"@stylistic/quotes": [ "error", "double" ],
	"@stylistic/semi": [ "error", "always" ],
	"@stylistic/space-before-function-paren": [ "error", {
		anonymous: "always",
		named: "never",
		asyncArrow: "always"
	} ],
	"@stylistic/space-in-parens": [ "error", "always" ],
	"@stylistic/template-curly-spacing": [ "error", "always" ]
};

// TypeScript-specific rules
const typeScriptRules = {
	"@typescript-eslint/no-unused-vars": "error",
	"@typescript-eslint/no-explicit-any": "warn",
	"@typescript-eslint/no-inferrable-types": "error"
};

export default [
	js.configs.recommended,
	{
		files: [ "**/*.{ts,tsx}" ],
		languageOptions: {
			...commonLanguageOptions,
			parser: tsparser,
			parserOptions: {
				...commonLanguageOptions,
				project: [
					"./tsconfig.json",
					"./apps/*/tsconfig.json"
				]
			}
		},
		plugins: {
			"@typescript-eslint": tseslint,
			"@stylistic": stylistic
		},
		rules: {
			...commonRules,
			...typeScriptRules,
			...commonStylisticRules
		}
	},
	{
		files: [ "**/*.js", "**/*.mjs" ],
		languageOptions: commonLanguageOptions,
		plugins: {
			"@stylistic": stylistic
		},
		rules: {
			"no-unused-vars": "error",
			...commonRules,
			...commonStylisticRules
		}
	},
	{
		ignores: [
			"node_modules/",
			"**/dist/",
			"**/build/",
			"coverage/"
		]
	}
];
