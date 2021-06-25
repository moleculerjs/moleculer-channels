module.exports = {
	env: {
		node: true,
		commonjs: true,
		es6: true,
		jquery: false,
		jest: true,
		jasmine: true
	},
	extends: ["eslint:recommended", "plugin:security/recommended", "plugin:prettier/recommended"],
	parserOptions: {
		sourceType: "module",
		ecmaVersion: 2018
	},
	plugins: ["node", "promise", "security"],
	rules: {
		"no-var": ["error"],
		"no-console": ["warn"],
		"no-unused-vars": ["warn"],
		"no-trailing-spaces": ["error"],
		"security/detect-object-injection": ["off"],
		"security/detect-non-literal-require": ["off"],
		"security/detect-non-literal-fs-filename": ["off"],
		"no-process-exit": ["off"],
		"node/no-unpublished-require": 0,
		"require-atomic-updates": 0,
		"object-curly-spacing": ["warn", "always"]
	}
};
