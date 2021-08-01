"use strict";

const { ServiceBroker } = require("moleculer");
const ChannelMiddleware = require("./../../").Middleware;

let Adapters;

if (process.env.GITHUB_ACTIONS_CI) {
	Adapters = [
		{ type: "Redis", options: {} },
		{ type: "AMQP", options: {} }
	];
} else {
	// Local development tests
	Adapters = [
		{ type: "Redis", options: {} },
		{ type: "AMQP", options: {} }
	];
}

describe("Integration tests", () => {
	for (const adapter of Adapters) {
		describe(`Adapter: ${adapter.name || adapter.type}`, () => {
			describe("Test simple publish/subscribe logic", () => {
				const broker = new ServiceBroker({
					logger: true,
					logLevel: "warn",
					middlewares: [ChannelMiddleware({ adapter })]
				});

				const subTestTopicHandler = jest.fn(() => Promise.resolve());

				broker.createService({
					name: "sub",
					channels: {
						"test.topic": subTestTopicHandler
					}
				});

				beforeAll(() => broker.start());
				afterAll(() => broker.stop());

				it("should receive the published message", async () => {
					const msg = {
						id: 1,
						name: "John",
						age: 25
					};

					await broker.sendToChannel("test.topic", msg);

					await broker.Promise.delay(200);

					expect(subTestTopicHandler).toHaveBeenCalledTimes(1);
					expect(subTestTopicHandler).toHaveBeenCalledWith(msg);
				});
			});
		});
	}
});
