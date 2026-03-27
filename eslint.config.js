const prettier = require("eslint-plugin-prettier");
const security = require("eslint-plugin-security");
const prettierConfig = require("eslint-config-prettier");

module.exports = [
	{
		ignores: ["node_modules/**", "coverage/**", "types/**"]
	},
	{
		files: ["**/*.js"],
		languageOptions: {
			ecmaVersion: 2020,
			sourceType: "commonjs",
			globals: {
				// Node.js globals
				require: "readonly",
				module: "readonly",
				exports: "readonly",
				__dirname: "readonly",
				__filename: "readonly",
				process: "readonly",
				console: "readonly",
				Buffer: "readonly",
				setTimeout: "readonly",
				clearTimeout: "readonly",
				setInterval: "readonly",
				clearInterval: "readonly",
				setImmediate: "readonly",
				Promise: "readonly",
				// Jest globals
				describe: "readonly",
				it: "readonly",
				test: "readonly",
				expect: "readonly",
				beforeAll: "readonly",
				afterAll: "readonly",
				beforeEach: "readonly",
				afterEach: "readonly",
				jest: "readonly"
			}
		},
		plugins: {
			prettier,
			security
		},
		rules: {
			...security.configs.recommended.rules,
			...prettierConfig.rules,
			"prettier/prettier": "error",
			"no-var": "error",
			"no-console": "warn",
			"no-unused-vars": "warn",
			"no-trailing-spaces": "error",
			"security/detect-object-injection": "off",
			"security/detect-non-literal-require": "off",
			"security/detect-non-literal-fs-filename": "off",
			"no-process-exit": "off",
			"require-atomic-updates": "off",
			"object-curly-spacing": ["warn", "always"]
		}
	}
];
