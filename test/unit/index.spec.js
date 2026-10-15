import { describe, expect, it, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { ServiceBroker } from "moleculer";
import { Middleware as ChannelMiddleware } from "./../../";

describe("Test service 'channelHandlerTrigger' method", () => {
	const serviceSchema = {
		name: "helper",

		channels: {
			async "helper.sum"(payload) {
				// Calls the sum method
				return this.sum(payload.a, payload.b);
			},

			"helper.subtract": {
				handler(payload) {
					return this.subtract(payload.a, payload.b);
				}
			}
		},

		methods: {
			sum(a, b) {
				return a + b;
			},

			subtract(a, b) {
				return a - b;
			}
		}
	};

	describe("Test service default value", () => {
		let broker = new ServiceBroker({
			logger: false,
			middlewares: [
				ChannelMiddleware({
					adapter: {
						type: "Fake"
					}
				})
			]
		});
		let service = broker.createService(serviceSchema);
		beforeAll(() => broker.start());
		afterAll(() => broker.stop());

		it("should register default 'emitLocalChannelHandler' function declaration", async () => {
			// Mock the "sum" method
			service.sum = vi.fn();

			// Call the "helper.sum" handler
			await service.emitLocalChannelHandler("helper.sum", { a: 5, b: 5 });
			// Check if "sum" method was called
			expect(service.sum).toHaveBeenCalledTimes(1);
			expect(service.sum).toHaveBeenCalledWith(5, 5);

			// Restore the "sum" method
			service.sum.mockRestore();
		});

		it("should register default 'emitLocalChannelHandler' object declaration", async () => {
			// Mock the "sum" method
			service.subtract = vi.fn();

			// Call the "helper.sum" handler
			await service.emitLocalChannelHandler("helper.subtract", { a: 5, b: 5 });
			// Check if "subtract" method was called
			expect(service.subtract).toHaveBeenCalledTimes(1);
			expect(service.subtract).toHaveBeenCalledWith(5, 5);

			// Restore the "subtract" method
			service.subtract.mockRestore();
		});
	});

	describe("Test service custom value", () => {
		let broker = new ServiceBroker({
			logger: false,
			middlewares: [
				ChannelMiddleware({
					channelHandlerTrigger: "myTrigger",
					adapter: {
						type: "Fake"
					}
				})
			]
		});
		let service = broker.createService(serviceSchema);
		beforeAll(() => broker.start());
		afterAll(() => broker.stop());

		it("should register with 'myTrigger'", async () => {
			// Mock the "sum" method
			service.sum = vi.fn();

			// Call the "helper.sum" handler
			await service.myTrigger("helper.sum", { a: 5, b: 5 });
			// Check if "sum" method was called
			expect(service.sum).toHaveBeenCalledTimes(1);
			expect(service.sum).toHaveBeenCalledWith(5, 5);

			// Restore the "sum" method
			service.sum.mockRestore();
		});
	});
});

describe("Test channel params validation", () => {
	const createValidationBroker = params => {
		const handler = vi.fn(() => Promise.resolve());
		const broker = new ServiceBroker({
			logger: false,
			middlewares: [
				ChannelMiddleware({
					adapter: {
						type: "Fake"
					}
				})
			]
		});

		broker.createService({
			name: "validator",
			channels: {
				"validation.topic": {
					params,
					handler
				}
			}
		});

		return { broker, handler };
	};

	describe("Test synchronous checker", () => {
		const { broker, handler } = createValidationBroker({
			id: "number",
			name: "string"
		});

		beforeAll(() => broker.start());
		afterAll(() => broker.stop());
		beforeEach(() => handler.mockClear());

		it("should call the handler for a valid message", async () => {
			const msg = { id: 1, name: "John" };

			await broker.sendToChannel("validation.topic", msg);
			await broker.Promise.delay(100);

			expect(handler).toHaveBeenCalledTimes(1);
			expect(handler).toHaveBeenCalledWith(msg, expect.anything());
		});

		it("should not call the handler for an invalid message", async () => {
			const msg = { id: "not-a-number", name: "John" };

			await broker.sendToChannel("validation.topic", msg);
			await broker.Promise.delay(100);

			expect(handler).toHaveBeenCalledTimes(0);
		});
	});

	describe("Test asynchronous checker", () => {
		// The `$$async` flag makes fastest-validator compile an async checker function
		const { broker, handler } = createValidationBroker({
			$$async: true,
			id: {
				type: "number",
				custom: async (value, errors) => {
					if (value <= 0) errors.push({ type: "positiveNumber", actual: value });
				},
				messages: {
					positiveNumber: "The 'id' field must be a positive number."
				}
			}
		});

		beforeAll(() => broker.start());
		afterAll(() => broker.stop());
		beforeEach(() => handler.mockClear());

		it("should call the handler for a valid message", async () => {
			const msg = { id: 1 };

			await broker.sendToChannel("validation.topic", msg);
			await broker.Promise.delay(100);

			expect(handler).toHaveBeenCalledTimes(1);
			expect(handler).toHaveBeenCalledWith(msg, expect.anything());
		});

		it("should not call the handler for an invalid message", async () => {
			const msg = { id: -1 };

			await broker.sendToChannel("validation.topic", msg);
			await broker.Promise.delay(100);

			expect(handler).toHaveBeenCalledTimes(0);
		});
	});
});
