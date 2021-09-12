module.exports = {
	env: {
		node: true,
		commonjs: true,
		es6: true
	},
	extends: ["eslint:recommended"],
	parserOptions: {
		sourceType: "module",
		ecmaVersion: 2018
	},
	rules: {
		indent: ["warn", "tab", { SwitchCase: 1 }],
		quotes: ["warn", "double"],
		semi: ["error", "always"],
		"no-var": ["warn"],
		"no-console": ["off"],
		"no-unused-vars": ["off"],
		"no-trailing-spaces": ["error"],
		"security/detect-possible-timing-attacks": ["off"]
	}
};
