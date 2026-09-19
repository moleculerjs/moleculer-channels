import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		coverage: {
			provider: "v8",
			include: ["src/**/*.{ts,js}"]
		},

		teardownTimeout: 30 * 1000,
		testTimeout: 5 * 60 * 1000,
		hookTimeout: 5 * 60 * 1000,

		maxConcurrency: 1
	}
});
