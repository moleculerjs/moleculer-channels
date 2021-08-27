"use strict";

const _ = require("lodash");
const { ServiceBroker } = require("moleculer");
const ChannelMiddleware = require("./../../").Middleware;

let Adapters;

if (process.env.GITHUB_ACTIONS_CI) {
	Adapters = [
		{ type: "Redis", options: {} },
		{
			type: "Redis",
			options: {
				cluster: {
					nodes: [
						{ host: "127.0.0.1", port: 6381 },
						{ host: "127.0.0.1", port: 6382 },
						{ host: "127.0.0.1", port: 6383 }
					]
				}
			}
		},
		{ type: "AMQP", options: {} }
	];
} else {
	// Local development tests
	Adapters = [
		{ type: "Redis", options: {} },
		{
			type: "Redis",
			options: {
				cluster: {
					nodes: [
						{ host: "127.0.0.1", port: 6381 },
						{ host: "127.0.0.1", port: 6382 },
						{ host: "127.0.0.1", port: 6383 }
					]
				}
			}
		},
		{ type: "AMQP", options: {} }
	];
}

describe("Integration tests", () => {
	function createBroker(adapter, opts) {
		return new ServiceBroker(
			_.defaultsDeep(opts, {
				logger: false,
				logLevel: "error",
				middlewares: [ChannelMiddleware({ adapter })]
			})
		);
	}

	for (const adapter of Adapters) {
		describe(`Adapter: ${adapter.name || adapter.type}`, () => {
			describe("Test simple publish/subscribe logic", () => {
				const broker = createBroker(adapter);

				const subTestTopicHandler = jest.fn(() => {
					return Promise.resolve();
				});

				broker.createService({
					name: "sub",
					channels: {
						"test.simple.topic": subTestTopicHandler
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
					// ---- ^ SETUP ^ ---
					await broker.sendToChannel("test.simple.topic", msg);
					await broker.Promise.delay(200);
					// ---- ˇ ASSERTS ˇ ---
					expect(subTestTopicHandler).toHaveBeenCalledTimes(1);
					expect(subTestTopicHandler).toHaveBeenCalledWith(msg, expect.anything());
				});
			});

			describe("Test multiple subscription logic", () => {
				const broker = createBroker(adapter);

				const sub1TestTopic1Handler = jest.fn(() => Promise.resolve());
				const sub1TestTopic2Handler = jest.fn(() => Promise.resolve());
				const sub2TestTopic1Handler = jest.fn(() => Promise.resolve());
				const sub2TestTopic2Handler = jest.fn(() => Promise.resolve());

				broker.createService({
					name: "sub1",
					channels: {
						"test.topic1": sub1TestTopic1Handler,
						"test.topic2": sub1TestTopic2Handler
					}
				});

				broker.createService({
					name: "sub2",
					channels: {
						"test.topic1": sub2TestTopic1Handler,
						"test.topic2": sub2TestTopic2Handler
					}
				});

				beforeAll(() => broker.start());
				afterAll(() => broker.stop());

				beforeEach(() => {
					sub1TestTopic1Handler.mockClear();
					sub1TestTopic2Handler.mockClear();
					sub2TestTopic1Handler.mockClear();
					sub2TestTopic2Handler.mockClear();
				});

				it("should receive the published 'test.topic1' message in both services", async () => {
					const msg = {
						id: 1,
						name: "John",
						age: 25
					};
					// ---- ^ SETUP ^ ---

					await broker.sendToChannel("test.topic1", msg);
					await broker.Promise.delay(200);

					// ---- ˇ ASSERTS ˇ ---
					expect(sub1TestTopic1Handler).toHaveBeenCalledTimes(1);
					expect(sub1TestTopic1Handler).toHaveBeenCalledWith(msg, expect.anything());

					expect(sub2TestTopic1Handler).toHaveBeenCalledTimes(1);
					expect(sub2TestTopic1Handler).toHaveBeenCalledWith(msg, expect.anything());

					expect(sub1TestTopic2Handler).toHaveBeenCalledTimes(0);
					expect(sub2TestTopic2Handler).toHaveBeenCalledTimes(0);
				});

				it("should receive the published 'test.topic2' message in both services", async () => {
					const msg = {
						id: 2,
						name: "Jane",
						age: 22
					};
					// ---- ^ SETUP ^ ---

					await broker.sendToChannel("test.topic2", msg);
					await broker.Promise.delay(200);

					// ---- ˇ ASSERTS ˇ ---
					expect(sub1TestTopic2Handler).toHaveBeenCalledTimes(1);
					expect(sub1TestTopic2Handler).toHaveBeenCalledWith(msg, expect.anything());

					expect(sub2TestTopic2Handler).toHaveBeenCalledTimes(1);
					expect(sub2TestTopic2Handler).toHaveBeenCalledWith(msg, expect.anything());

					expect(sub1TestTopic1Handler).toHaveBeenCalledTimes(0);
					expect(sub2TestTopic1Handler).toHaveBeenCalledTimes(0);
				});
			});

			describe("Test balanced subscription logic", () => {
				const broker = createBroker(adapter);

				const sub1Handler = jest.fn(() => Promise.resolve());
				const sub2Handler = jest.fn(() => Promise.resolve());
				const sub3Handler = jest.fn(() => Promise.resolve());

				broker.createService({
					name: "sub1",
					channels: {
						"test.balanced.topic": {
							group: "mygroup",
							handler: sub1Handler
						}
					}
				});

				broker.createService({
					name: "sub2",
					channels: {
						"test.balanced.topic": {
							group: "mygroup",
							handler: sub2Handler
						}
					}
				});

				broker.createService({
					name: "sub3",
					channels: {
						"test.balanced.topic": {
							group: "mygroup",
							handler: sub3Handler
						}
					}
				});

				beforeAll(() => broker.start());
				afterAll(() => broker.stop());

				beforeEach(() => {
					sub1Handler.mockClear();
					sub2Handler.mockClear();
					sub3Handler.mockClear();
				});

				it("should receive the message balanced between the services", async () => {
					const msg = {
						id: 1,
						name: "John",
						age: 25
					};
					// ---- ^ SETUP ^ ---

					await Promise.all(
						_.times(6, () => broker.sendToChannel("test.balanced.topic", msg))
					);
					await broker.Promise.delay(500);

					// ---- ˇ ASSERTS ˇ ---
					expect(sub1Handler.mock.calls.length).toBeGreaterThanOrEqual(1);
					expect(sub1Handler).toHaveBeenCalledWith(msg, expect.anything());

					expect(sub2Handler.mock.calls.length).toBeGreaterThanOrEqual(1);
					expect(sub2Handler).toHaveBeenCalledWith(msg, expect.anything());

					expect(sub3Handler.mock.calls.length).toBeGreaterThanOrEqual(1);
					expect(sub3Handler).toHaveBeenCalledWith(msg, expect.anything());
				});
			});

			describe("Test retried messages logic", () => {
				const broker = createBroker(adapter);

				const error = new Error("Something happened");
				const subWrongHandler = jest.fn(() => Promise.reject(error));
				const subGoodHandler = jest.fn(() => Promise.resolve());

				broker.createService({
					name: "sub1",
					channels: {
						"test.unstable.topic": {
							group: "mygroup",
							maxRetries: 5,
							handler: subWrongHandler
						}
					}
				});

				broker.createService({
					name: "sub2",
					channels: {
						"test.unstable.topic": {
							group: "mygroup",
							// Defaults to 1 hour. Decrease for unit tests
							minIdleTime: 10,
							claimInterval: 10,
							maxRetries: 5,
							handler: subGoodHandler
						}
					}
				});

				beforeAll(() => broker.start());
				afterAll(() => broker.stop());

				beforeEach(() => {
					subWrongHandler.mockClear();
					subGoodHandler.mockClear();
				});

				it("should retried rejected messages and process by the good handler", async () => {
					// ---- ^ SETUP ^ ---

					await Promise.all(
						_.times(6, id => broker.sendToChannel("test.unstable.topic", { id }))
					);
					await broker.Promise.delay(1500);

					// ---- ˇ ASSERTS ˇ ---
					//expect(subGoodHandler).toHaveBeenCalledTimes(6);
					expect(subGoodHandler).toHaveBeenCalledWith({ id: 0 }, expect.anything());
					expect(subGoodHandler).toHaveBeenCalledWith({ id: 1 }, expect.anything());
					expect(subGoodHandler).toHaveBeenCalledWith({ id: 2 }, expect.anything());
					expect(subGoodHandler).toHaveBeenCalledWith({ id: 3 }, expect.anything());
					expect(subGoodHandler).toHaveBeenCalledWith({ id: 4 }, expect.anything());
					expect(subGoodHandler).toHaveBeenCalledWith({ id: 5 }, expect.anything());

					expect(subWrongHandler.mock.calls.length).toBeGreaterThan(1);
				});
			});

			describe("Test Connection/Reconnection logic", () => {
				const broker = createBroker(adapter);

				const sub1Handler = jest.fn(() => Promise.resolve());
				const sub2Handler = jest.fn(() => Promise.resolve());

				beforeAll(() => broker.start());
				afterAll(() => broker.stop());

				beforeEach(() => {
					sub1Handler.mockClear();
					sub2Handler.mockClear();
				});

				it("should read messages after connecting", async () => {
					let id = 0;

					// -> Create and start the service to register consumer groups and queues <- //
					const svc0 = broker.createService({
						name: "sub1",
						channels: {
							"test.delayed.connection.topic": {
								group: "mygroup",
								maxInFlight: 6,
								handler: sub1Handler
							}
						}
					});
					await broker.Promise.delay(500);
					await broker.destroyService(svc0);
					await broker.Promise.delay(200);
					// ---- ^ SETUP ^ ---

					// -> Publish the messages while no listeners are running <- //
					await Promise.all(
						_.times(6, () =>
							broker.sendToChannel("test.delayed.connection.topic", { id: id++ })
						)
					);
					await broker.Promise.delay(200);

					// -> Create and start the service <- //
					const svc1 = broker.createService({
						name: "sub1",
						channels: {
							"test.delayed.connection.topic": {
								group: "mygroup",
								maxInFlight: 6,
								handler: sub1Handler
							}
						}
					});
					await broker.Promise.delay(1000);

					// ---- ˇ ASSERT ˇ ---
					expect(sub1Handler).toHaveBeenCalledTimes(6);
					expect(sub1Handler).toHaveBeenCalledWith({ id: 0 }, expect.anything());
					expect(sub1Handler).toHaveBeenCalledWith({ id: 1 }, expect.anything());
					expect(sub1Handler).toHaveBeenCalledWith({ id: 2 }, expect.anything());
					expect(sub1Handler).toHaveBeenCalledWith({ id: 3 }, expect.anything());
					expect(sub1Handler).toHaveBeenCalledWith({ id: 4 }, expect.anything());
					expect(sub1Handler).toHaveBeenCalledWith({ id: 5 }, expect.anything());

					// -> Server is going down <- //
					await broker.destroyService(svc1);
					await broker.Promise.delay(200);

					// -> In mean time, more messages are being published <- //
					await Promise.all(
						_.times(6, () =>
							broker.sendToChannel("test.delayed.connection.topic", { id: id++ })
						)
					);
					await broker.Promise.delay(200);

					// -> Service replica is starting <- //
					broker.createService({
						name: "sub1",
						channels: {
							"test.delayed.connection.topic": {
								group: "mygroup",
								maxInFlight: 6,
								handler: sub2Handler
							}
						}
					});
					await broker.Promise.delay(1000);

					// ---- ˇ ASSERT ˇ ---
					expect(sub2Handler).toHaveBeenCalledTimes(6);
					expect(sub2Handler).toHaveBeenCalledWith({ id: 6 }, expect.anything());
					expect(sub2Handler).toHaveBeenCalledWith({ id: 7 }, expect.anything());
					expect(sub2Handler).toHaveBeenCalledWith({ id: 8 }, expect.anything());
					expect(sub2Handler).toHaveBeenCalledWith({ id: 9 }, expect.anything());
					expect(sub2Handler).toHaveBeenCalledWith({ id: 10 }, expect.anything());
					expect(sub2Handler).toHaveBeenCalledWith({ id: 11 }, expect.anything());
				});
			});

			describe("Test Failed Message logic", () => {
				const broker = createBroker(adapter);

				const error = new Error("Something happened");
				const subGoodHandler = jest.fn(() => Promise.resolve());
				const subWrongHandler = jest.fn(() => Promise.reject(error));

				beforeAll(() => broker.start());
				afterAll(() => broker.stop());

				beforeEach(() => {
					subWrongHandler.mockClear();
				});

				it("should place message into FAILED LIST", async () => {
					// -> Create and start the services to register consumer groups and queues <- //
					broker.createService({
						name: "sub1",
						channels: {
							"test.fail.topic": {
								maxInFlight: 1,
								minIdleTime: 50,
								claimInterval: 50,
								maxRetries: 6,
								processingAttemptsInterval: 10,
								handler: subWrongHandler
							}
						}
					});

					broker.createService({
						name: "sub2",
						channels: {
							"test.fail.topic": {
								maxInFlight: 1,
								minIdleTime: 50,
								claimInterval: 50,
								maxRetries: 6,
								processingAttemptsInterval: 10,
								handler: subGoodHandler
							}
						}
					});

					await broker.Promise.delay(500);
					// -> Publish a message <- //
					await broker.sendToChannel("test.fail.topic", { test: 1 });
					await broker.Promise.delay(1000);

					// ---- ˇ ASSERT ˇ ---
					expect(subGoodHandler).toHaveBeenCalledTimes(1);
					expect(subWrongHandler).toHaveBeenCalledTimes(6);
				});
			});

			describe("Test Max-In-Flight logic", () => {
				const broker = createBroker({ ...adapter, options: { amqp: { prefetch: 1 } } });

				let FLOW = [];

				broker.createService({
					name: "sub1",
					channels: {
						"test.mif.topic": {
							maxInFlight: 1,
							async handler(payload) {
								FLOW.push(`BEGIN: ${payload.id}`);
								await this.Promise.delay(300);
								FLOW.push(`END: ${payload.id}`);
							}
						}
					}
				});

				beforeAll(() => broker.start());
				afterAll(() => broker.stop());

				beforeEach(() => {
					FLOW = [];
				});

				it("should process the messages 1-to-1", async () => {
					// -> Publish messages <- //
					await Promise.all(
						_.times(5, i => broker.sendToChannel("test.mif.topic", { id: i }))
					);
					await broker.Promise.delay(2000);

					// ---- ˇ ASSERT ˇ ---
					expect(FLOW).toEqual([
						"BEGIN: 0",
						"END: 0",
						"BEGIN: 1",
						"END: 1",
						"BEGIN: 2",
						"END: 2",
						"BEGIN: 3",
						"END: 3",
						"BEGIN: 4",
						"END: 4"
					]);
				});
			});

			describe("Test namespaces logic", () => {
				// --- NO NAMESPACE ---
				const broker1 = createBroker(adapter, {});
				const subHandler1 = jest.fn(() => Promise.resolve());
				broker1.createService({
					name: "sub",
					channels: { "test.ns.topic": subHandler1 }
				});

				// --- NAMESPACE A ---
				const broker2 = createBroker(adapter, { namespace: "A" });
				const subHandler2 = jest.fn(() => Promise.resolve());
				broker2.createService({
					name: "sub",
					channels: { "test.ns.topic": subHandler2 }
				});

				// --- NAMESPACE B ---
				const broker3 = createBroker(adapter, { namespace: "B" });
				const subHandler3 = jest.fn(() => Promise.resolve());
				broker3.createService({
					name: "sub",
					channels: { "test.ns.topic": subHandler3 }
				});

				// --- NAMESPACE BUT NO PREFIX ---
				const broker4 = createBroker(
					{ ...adapter, options: { prefix: "" } },
					{ namespace: "C" }
				);
				const subHandler4 = jest.fn(() => Promise.resolve());
				broker4.createService({
					name: "sub",
					channels: { "test.ns.topic": { group: "other", handler: subHandler4 } }
				});

				// --- NO NAMESPACE BUT PREFIX ---
				const broker5 = createBroker({ ...adapter, options: { prefix: "C" } });
				const subHandler5 = jest.fn(() => Promise.resolve());
				broker5.createService({
					name: "sub",
					channels: { "test.ns.topic": { handler: subHandler5 } }
				});

				beforeAll(() =>
					Promise.all([
						broker1.start(),
						broker2.start(),
						broker3.start(),
						broker4.start(),
						broker5.start()
					])
				);
				afterAll(() =>
					Promise.all([
						broker1.stop(),
						broker2.stop(),
						broker3.stop(),
						broker4.stop(),
						broker5.stop()
					])
				);

				beforeEach(() => {
					subHandler1.mockClear();
					subHandler2.mockClear();
					subHandler3.mockClear();
					subHandler4.mockClear();
					subHandler5.mockClear();
				});

				it("should receive the published message on no-namespace handlers", async () => {
					const msg = {
						id: 1,
						name: "John",
						age: 25
					};
					// ---- ^ SETUP ^ ---
					await broker1.sendToChannel("test.ns.topic", msg);
					await broker1.sendToChannel("test.ns.topic", msg);
					await broker1.Promise.delay(200);
					// ---- ˇ ASSERTS ˇ ---
					expect(subHandler1).toHaveBeenCalledTimes(2);
					expect(subHandler2).toHaveBeenCalledTimes(0);
					expect(subHandler3).toHaveBeenCalledTimes(0);
					expect(subHandler4).toHaveBeenCalledTimes(2);
					expect(subHandler5).toHaveBeenCalledTimes(0);
				});

				it("should receive the published message on no-namespace handlers (broker4)", async () => {
					const msg = {
						id: 1,
						name: "John",
						age: 25
					};
					// ---- ^ SETUP ^ ---
					await broker4.sendToChannel("test.ns.topic", msg);
					await broker4.sendToChannel("test.ns.topic", msg);
					await broker4.Promise.delay(200);
					// ---- ˇ ASSERTS ˇ ---
					expect(subHandler1).toHaveBeenCalledTimes(2);
					expect(subHandler2).toHaveBeenCalledTimes(0);
					expect(subHandler3).toHaveBeenCalledTimes(0);
					expect(subHandler4).toHaveBeenCalledTimes(2);
					expect(subHandler5).toHaveBeenCalledTimes(0);
				});

				it("should receive the published message on namespace 'A'", async () => {
					const msg = {
						id: 1,
						name: "John",
						age: 25
					};
					// ---- ^ SETUP ^ ---
					await broker2.sendToChannel("test.ns.topic", msg);
					await broker2.sendToChannel("test.ns.topic", msg);
					await broker2.Promise.delay(200);
					// ---- ˇ ASSERTS ˇ ---
					expect(subHandler1).toHaveBeenCalledTimes(0);
					expect(subHandler2).toHaveBeenCalledTimes(2);
					expect(subHandler3).toHaveBeenCalledTimes(0);
					expect(subHandler4).toHaveBeenCalledTimes(0);
					expect(subHandler5).toHaveBeenCalledTimes(0);
				});

				it("should receive the published message on namespace 'B'", async () => {
					const msg = {
						id: 1,
						name: "John",
						age: 25
					};
					// ---- ^ SETUP ^ ---
					await broker3.sendToChannel("test.ns.topic", msg);
					await broker3.sendToChannel("test.ns.topic", msg);
					await broker3.Promise.delay(200);
					// ---- ˇ ASSERTS ˇ ---
					expect(subHandler1).toHaveBeenCalledTimes(0);
					expect(subHandler2).toHaveBeenCalledTimes(0);
					expect(subHandler3).toHaveBeenCalledTimes(2);
					expect(subHandler4).toHaveBeenCalledTimes(0);
					expect(subHandler5).toHaveBeenCalledTimes(0);
				});

				it("should receive the published message on namespace 'C'", async () => {
					const msg = {
						id: 1,
						name: "John",
						age: 25
					};
					// ---- ^ SETUP ^ ---
					await broker5.sendToChannel("test.ns.topic", msg);
					await broker5.sendToChannel("test.ns.topic", msg);
					await broker5.Promise.delay(200);
					// ---- ˇ ASSERTS ˇ ---
					expect(subHandler1).toHaveBeenCalledTimes(0);
					expect(subHandler2).toHaveBeenCalledTimes(0);
					expect(subHandler3).toHaveBeenCalledTimes(0);
					expect(subHandler4).toHaveBeenCalledTimes(0);
					expect(subHandler5).toHaveBeenCalledTimes(2);
				});
			});

			if (adapter.type !== "AMQP") {
				describe("Test Dead Letter logic", () => {
					const broker = createBroker(adapter, { logLevel: "debug" });

					const error = new Error("Something happened");
					const deaLetterHandler = jest.fn(() => Promise.resolve());
					const subWrongHandler = jest.fn(() => Promise.reject(error));

					broker.createService({
						name: "sub1",
						channels: {
							"test.failed_messages.topic": {
								group: "mygroup",
								claimInterval: 50,
								maxRetries: 0,
								deadLettering: {
									enabled: true,
									queueName: "DEAD_LETTER"
								},
								handler: subWrongHandler
							}
						}
					});

					broker.createService({
						name: "sub2",
						channels: {
							DEAD_LETTER: {
								handler: deaLetterHandler
							}
						}
					});

					beforeAll(() => broker.start());
					afterAll(() => broker.stop());

					beforeEach(() => {
						deaLetterHandler.mockClear();
						subWrongHandler.mockClear();
					});

					it("should transfer to FAILED_MESSAGES", async () => {
						const msg = {
							id: 1,
							name: "John",
							age: 2565
						};
						// ---- ^ SETUP ^ ---

						await broker.Promise.delay(500);

						broker.sendToChannel("test.failed_messages.topic", msg);
						await broker.Promise.delay(500);

						// ---- ˇ ASSERTS ˇ ---
						expect(subWrongHandler).toHaveBeenCalledTimes(1);

						expect(deaLetterHandler).toHaveBeenCalledTimes(1);

						await broker.Promise.delay(500);
					});
				});
			}
		});
	}
});

describe("Multiple Adapters", () => {
	const broker = new ServiceBroker({
		logger: true,
		logLevel: "error",
		middlewares: [
			// Default options
			ChannelMiddleware({ adapter: { type: "Redis", options: {} } }),
			ChannelMiddleware({
				adapter: "Redis",
				schemaProperty: "redisChannels",
				sendMethodName: "sendToRedisChannel",
				adapterPropertyName: "redisAdapter"
			}),
			ChannelMiddleware({
				adapter: "AMQP",
				schemaProperty: "amqpChannels",
				sendMethodName: "sendToAMQPChannel",
				adapterPropertyName: "amqpAdapter"
			})
		]
	});

	const defaultChannelHandler = jest.fn(() => Promise.resolve());
	const redisChannelHandler = jest.fn(() => Promise.resolve());
	const amqpChannelHandler = jest.fn(() => Promise.resolve());

	broker.createService({
		name: "sub",
		channels: {
			"test.default.options.topic": {
				group: "mygroup",
				handler: defaultChannelHandler
			}
		},
		redisChannels: {
			"test.redis.topic": {
				group: "mygroup",
				handler: redisChannelHandler
			}
		},
		amqpChannels: {
			"test.amqp.topic": {
				group: "mygroup",
				handler: amqpChannelHandler
			}
		}
	});

	beforeAll(() => broker.start());
	afterAll(() => broker.stop());

	it("should work with multiple adapters", async () => {
		const msgDefault = { test: "default" };
		const msgRedis = { test: 123 };
		const msgAMQP = { test: 456 };

		await broker.sendToChannel("test.default.options.topic", msgDefault);
		await broker.sendToRedisChannel("test.redis.topic", msgRedis);
		await broker.sendToAMQPChannel("test.amqp.topic", msgAMQP);

		await broker.Promise.delay(500);

		// ---- ˇ ASSERT ˇ ---
		expect(defaultChannelHandler).toHaveBeenCalledTimes(1);
		expect(defaultChannelHandler).toHaveBeenCalledWith(msgDefault, expect.anything());

		expect(redisChannelHandler).toHaveBeenCalledTimes(1);
		expect(redisChannelHandler).toHaveBeenCalledWith(msgRedis, expect.anything());

		expect(amqpChannelHandler).toHaveBeenCalledTimes(1);
		expect(amqpChannelHandler).toHaveBeenCalledWith(msgAMQP, expect.anything());

		expect(broker.channelAdapter).toBeDefined();
		expect(broker.redisAdapter).toBeDefined();
		expect(broker.amqpAdapter).toBeDefined();
	});
});

// TODO multiple namespaces
