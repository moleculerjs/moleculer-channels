"use strict";

const { ServiceBroker } = require("moleculer");
const ChannelMiddleware = require("./../../").Middleware;

describe("Test service 'channelHandlerTrigger' method", () => {
	const serviceSchema = {
		name: "helper",

		channels: {
			async "helper.sum"(payload) {
				// Calls the sum method
				return this.sum(payload.a, payload.b);
			}
		},

		methods: {
			sum(a, b) {
				return a + b;
			}
		}
	};

	describe("Test service default value", () => {
		let broker = new ServiceBroker({
			logger: false,
			middlewares: [
				ChannelMiddleware({
					adapter: {
						type: "NATS"
					}
				})
			]
		});
		let service = broker.createService(serviceSchema);
		beforeAll(() => broker.start());
		afterAll(() => broker.stop());

		it("should register default 'emitLocalChannelHandler'", async () => {
			// Mock the "sum" method
			service.sum = jest.fn();

			// Call the "helper.sum" handler
			await service.emitLocalChannelHandler("helper.sum", { a: 5, b: 5 });
			// Check if "sum" method was called
			expect(service.sum).toBeCalledTimes(1);
			expect(service.sum).toBeCalledWith(5, 5);

			// Restore the "sum" method
			service.sum.mockRestore();
		});
	});

	describe("Test service custom value", () => {
		let broker = new ServiceBroker({
			logger: false,
			middlewares: [
				ChannelMiddleware({
					channelHandlerTrigger: "myTrigger",
					adapter: {
						type: "NATS"
					}
				})
			]
		});
		let service = broker.createService(serviceSchema);
		beforeAll(() => broker.start());
		afterAll(() => broker.stop());

		it("should register with 'myTrigger'", async () => {
			// Mock the "sum" method
			service.sum = jest.fn();

			// Call the "helper.sum" handler
			await service.myTrigger("helper.sum", { a: 5, b: 5 });
			// Check if "sum" method was called
			expect(service.sum).toBeCalledTimes(1);
			expect(service.sum).toBeCalledWith(5, 5);

			// Restore the "sum" method
			service.sum.mockRestore();
		});
	});
});
