import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		coverage: {
			provider: "v8",
			include: ["src/**/*.{ts,js}"]
		},

		teardownTimeout: 10 * 1000,
		testTimeout: 60 * 1000,
		hookTimeout: 30 * 1000
	}
});
