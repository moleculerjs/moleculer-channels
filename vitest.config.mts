import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		coverage: {
			provider: "v8",
			include: ["src/**/*.{ts,js}"],
			reporter: ["text", "lcov", "clover", "json"]
		},

		teardownTimeout: 30 * 1000,
		// Enough to run locally and enough for CI as well while not exceeding `timeout-minutes` @ .github/workflows/integration.yml
		testTimeout: 3 * 60 * 1000,
		hookTimeout: 3 * 60 * 1000,

		maxConcurrency: 1
	}
});
