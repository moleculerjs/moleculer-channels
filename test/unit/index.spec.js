"use strict";

import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
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

		afterEach(() => {
			// Restore all mocks after each test
			vi.restoreAllMocks();
		});

		it("should register default 'emitLocalChannelHandler' function declaration", async () => {
			// Mock the "sum" method
			service.sum = vi.fn();

			// Call the "helper.sum" handler
			await service.emitLocalChannelHandler("helper.sum", { a: 5, b: 5 });
			// Check if "sum" method was called
			expect(service.sum).toHaveBeenCalledTimes(1);
			expect(service.sum).toHaveBeenCalledWith(5, 5);
		});

		it("should register default 'emitLocalChannelHandler' object declaration", async () => {
			// Mock the "sum" method
			service.subtract = vi.fn();

			// Call the "helper.sum" handler
			await service.emitLocalChannelHandler("helper.subtract", { a: 5, b: 5 });
			// Check if "subtract" method was called
			expect(service.subtract).toHaveBeenCalledTimes(1);
			expect(service.subtract).toHaveBeenCalledWith(5, 5);
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

		afterEach(() => {
			// Restore all mocks after each test
			vi.restoreAllMocks();
		});

		it("should register with 'myTrigger'", async () => {
			// Mock the "sum" method
			service.sum = vi.fn();

			// Call the "helper.sum" handler
			await service.myTrigger("helper.sum", { a: 5, b: 5 });
			// Check if "sum" method was called
			expect(service.sum).toHaveBeenCalledTimes(1);
			expect(service.sum).toHaveBeenCalledWith(5, 5);
		});
	});
});
