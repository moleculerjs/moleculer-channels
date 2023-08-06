"use strict";

const _ = require("lodash");
const { ServiceBroker, Context } = require("moleculer");
const ChannelMiddleware = require("./../../").Middleware;

const Kafka = require("kafkajs").Kafka;

let Adapters;

if (process.env.GITHUB_ACTIONS_CI) {
	Adapters = [
		{ type: "Fake", options: {} },
		{ type: "Redis", options: {} },
		{
			type: "Redis",
			name: "Redis-Cluster",
			options: {
				redis: {
					cluster: {
						nodes: [
							{ host: "127.0.0.1", port: 6381 },
							{ host: "127.0.0.1", port: 6382 },
							{ host: "127.0.0.1", port: 6383 }
						]
					}
				}
			}
		},
		{ type: "AMQP", options: {} },
		{ type: "NATS", options: {} },
		{ type: "Kafka", options: { kafka: { brokers: ["localhost:9093"] } } },
		{ type: "Fake", name: "Multi", options: {} }
	].filter(a => (a.name || a.type) == process.env.ADAPTER);
} else {
	// Local development tests
	Adapters = [
		/*{ type: "Fake", options: {} },
		{ type: "Redis", options: {} },
		{
			type: "Redis",
			name: "Redis-Cluster",
			options: {
				redis: {
					cluster: {
						nodes: [
							{ host: "127.0.0.1", port: 6381 },
							{ host: "127.0.0.1", port: 6382 },
							{ host: "127.0.0.1", port: 6383 }
						]
					}
				}
			}
		},*/
		{ type: "AMQP", options: {} }
		/*{ type: "NATS", options: {} },
		{ type: "Kafka", options: { kafka: { brokers: ["localhost:9093"] } } }
		 */
	];
}

jest.setTimeout(60000);

let DELAY_AFTER_BROKER_START = 1000;

describe("Integration tests", () => {
	function createBroker(adapter, opts) {
		return new ServiceBroker(
			_.defaultsDeep(opts, {
				nodeID: "int-test",
				logger: false,
				logLevel: "debug",
				middlewares: [ChannelMiddleware({ adapter })]
			})
		);
	}

	for (const adapter of Adapters) {
		describe(`Adapter: ${adapter.name || adapter.type}`, () => {
			if (adapter.type == "Kafka") {
				DELAY_AFTER_BROKER_START = 2000;
				it("initialize Kafka topics", async () => {
					await createKafkaTopics(adapter, [
						{ topic: "test.balanced.topic", numPartitions: 3 },
						{ topic: "test.unstable.topic", numPartitions: 2 },
						{ topic: "test.fail.topic", numPartitions: 1 }
					]);
				});
			}

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

				beforeAll(() => broker.start().delay(DELAY_AFTER_BROKER_START));
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

			describe("Test different serializer", () => {
				const broker = createBroker(
					_.defaultsDeep({ options: { serializer: "MsgPack" } }, adapter)
				);

				const subTestTopicHandler = jest.fn(() => {
					return Promise.resolve();
				});

				broker.createService({
					name: "sub",
					channels: {
						"test.serializer.topic": subTestTopicHandler
					}
				});

				beforeAll(() => broker.start().delay(DELAY_AFTER_BROKER_START));
				afterAll(() => broker.stop());

				it("should receive the published message", async () => {
					const msg = {
						id: 1,
						name: "John",
						age: 25
					};
					// ---- ^ SETUP ^ ---
					await broker.sendToChannel("test.serializer.topic", msg);
					await broker.Promise.delay(200);
					// ---- ˇ ASSERTS ˇ ---
					expect(subTestTopicHandler).toHaveBeenCalledTimes(1);
					expect(subTestTopicHandler).toHaveBeenCalledWith(msg, expect.anything());
				});
			});

			describe("Test publish/subscribe logic with context", () => {
				const broker = createBroker(adapter);

				const subTestTopicHandler = jest.fn(() => {
					return Promise.resolve();
				});

				broker.createService({
					name: "sub",
					channels: {
						"test.simple.topic": {
							context: true,
							handler: subTestTopicHandler
						}
					}
				});

				beforeAll(() => broker.start().delay(DELAY_AFTER_BROKER_START));
				afterAll(() => broker.stop());

				it("should receive the published message as Context", async () => {
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
					expect(subTestTopicHandler).toHaveBeenCalledWith(
						expect.any(Context),
						expect.anything()
					);
					expect(subTestTopicHandler.mock.calls[0][0].params).toEqual(msg);
				});

				it("should receive the published message as Context with meta", async () => {
					subTestTopicHandler.mockClear();

					const msg = {
						id: 1,
						name: "John",
						age: 25
					};

					const ctx = Context.create(broker, null);
					ctx.meta = { a: 5, b: { c: "Hello" } };

					// ---- ^ SETUP ^ ---
					await broker.sendToChannel("test.simple.topic", msg, { ctx });
					await broker.Promise.delay(200);
					// ---- ˇ ASSERTS ˇ ---
					expect(subTestTopicHandler).toHaveBeenCalledTimes(1);
					expect(subTestTopicHandler).toHaveBeenCalledWith(
						expect.any(Context),
						expect.anything()
					);

					const ctx2 = subTestTopicHandler.mock.calls[0][0];
					expect(ctx2.params).toEqual(msg);
					expect(ctx2.meta).toEqual({
						a: 5,
						b: { c: "Hello" }
					});
					expect(ctx2.parentID).toEqual(ctx.id);
					expect(ctx2.requestID).toEqual(ctx.requestID);
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

				beforeAll(() => broker.start().delay(DELAY_AFTER_BROKER_START));
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

				beforeAll(() => broker.start().delay(DELAY_AFTER_BROKER_START));
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

					const numMessages = 20;

					await Promise.all(
						_.times(numMessages, () => broker.sendToChannel("test.balanced.topic", msg))
					);
					await broker.Promise.delay(500);

					// ---- ˇ ASSERTS ˇ ---
					expect(sub1Handler.mock.calls.length).toBeGreaterThanOrEqual(1);
					expect(sub1Handler).toHaveBeenCalledWith(msg, expect.anything());

					expect(sub2Handler.mock.calls.length).toBeGreaterThanOrEqual(1);
					expect(sub2Handler).toHaveBeenCalledWith(msg, expect.anything());

					expect(sub3Handler.mock.calls.length).toBeGreaterThanOrEqual(1);
					expect(sub3Handler).toHaveBeenCalledWith(msg, expect.anything());

					// All messages must be processed by the consumers
					expect(
						sub1Handler.mock.calls.length +
							sub2Handler.mock.calls.length +
							sub3Handler.mock.calls.length
					).toEqual(numMessages);
				});
			});

			if (adapter.type != "Fake") {
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
								maxRetries: 10,
								handler: subWrongHandler
							}
						}
					});

					broker.createService({
						name: "sub2",
						channels: {
							"test.unstable.topic": {
								group: "mygroup",
								redis: {
									// Defaults to 1 hour. Decrease for unit tests
									minIdleTime: 10,
									claimInterval: 10
								},
								maxRetries: 10,
								handler: subGoodHandler
							}
						}
					});

					beforeAll(() => broker.start().delay(DELAY_AFTER_BROKER_START));
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

						expect(subWrongHandler.mock.calls.length).toBeGreaterThanOrEqual(1);
					});
				});

				describe("Test Connection/Reconnection logic", () => {
					const broker = createBroker(adapter);

					const sub1Handler = jest.fn(() => Promise.resolve());
					const sub2Handler = jest.fn(() => Promise.resolve());

					beforeAll(() => broker.start().delay(DELAY_AFTER_BROKER_START));
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
						await broker.Promise.delay(2000);
						// ---- ^ SETUP ^ ---

						await broker.sendToChannel("test.delayed.connection.topic", { id: id++ });
						await broker.Promise.delay(500);
						expect(sub1Handler).toHaveBeenCalledTimes(1);
						expect(sub1Handler).toHaveBeenCalledWith({ id: 0 }, expect.anything());

						// Destroy service
						await broker.Promise.delay(500);
						await broker.destroyService(svc0);
						await broker.Promise.delay(200);
						sub1Handler.mockClear();

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
						expect(sub1Handler).toHaveBeenCalledWith({ id: 1 }, expect.anything());
						expect(sub1Handler).toHaveBeenCalledWith({ id: 2 }, expect.anything());
						expect(sub1Handler).toHaveBeenCalledWith({ id: 3 }, expect.anything());
						expect(sub1Handler).toHaveBeenCalledWith({ id: 4 }, expect.anything());
						expect(sub1Handler).toHaveBeenCalledWith({ id: 5 }, expect.anything());
						expect(sub1Handler).toHaveBeenCalledWith({ id: 6 }, expect.anything());

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
						await broker.Promise.delay(2000);

						// ---- ˇ ASSERT ˇ ---
						expect(sub2Handler).toHaveBeenCalledTimes(6);
						expect(sub2Handler).toHaveBeenCalledWith({ id: 7 }, expect.anything());
						expect(sub2Handler).toHaveBeenCalledWith({ id: 8 }, expect.anything());
						expect(sub2Handler).toHaveBeenCalledWith({ id: 9 }, expect.anything());
						expect(sub2Handler).toHaveBeenCalledWith({ id: 10 }, expect.anything());
						expect(sub2Handler).toHaveBeenCalledWith({ id: 11 }, expect.anything());
						expect(sub2Handler).toHaveBeenCalledWith({ id: 12 }, expect.anything());
					});
				});

				describe("Test Failed Message logic", () => {
					const broker = createBroker(adapter);

					const error = new Error("Something happened");
					const subGoodHandler = jest.fn(() => Promise.resolve());
					const subWrongHandler = jest.fn(() => Promise.reject(error));

					beforeAll(() => broker.start().delay(DELAY_AFTER_BROKER_START));
					afterAll(() => broker.stop());

					beforeEach(() => {
						subGoodHandler.mockClear();
						subWrongHandler.mockClear();
					});

					it("should retry failed messages only the failed consumer group", async () => {
						// -> Create and start the services to register consumer groups and queues <- //
						broker.createService({
							name: "sub1",
							channels: {
								"test.fail.topic": {
									maxInFlight: 1,
									maxRetries: 6,
									redis: {
										minIdleTime: 50,
										claimInterval: 50,
										processingAttemptsInterval: 10
									},
									handler: subWrongHandler
								}
							}
						});

						broker.createService({
							name: "sub2",
							channels: {
								"test.fail.topic": {
									maxInFlight: 1,
									maxRetries: 6,
									redis: {
										minIdleTime: 50,
										claimInterval: 50,
										processingAttemptsInterval: 10
									},
									handler: subGoodHandler
								}
							}
						});

						await broker.Promise.delay(DELAY_AFTER_BROKER_START);
						// -> Publish a message <- //
						await broker.sendToChannel("test.fail.topic", { test: 1 });
						await broker.Promise.delay(2000);

						// ---- ˇ ASSERT ˇ ---
						expect(subGoodHandler).toHaveBeenCalledTimes(1);
						expect(subWrongHandler).toHaveBeenCalledTimes(6);
					});
				});
			}

			describe("Test Max-In-Flight logic", () => {
				const broker = createBroker(
					_.defaultsDeep({ options: { amqp: { prefetch: 1 } } }, adapter)
				);

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

				beforeAll(() => broker.start().delay(DELAY_AFTER_BROKER_START));
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

			if (adapter.type != "Fake") {
				describe("Test namespaces logic", () => {
					// --- NO NAMESPACE ---
					const broker1 = createBroker(adapter, { nodeID: "int-test-1" });
					const subHandler1 = jest.fn(() => Promise.resolve());
					broker1.createService({
						name: "sub",
						channels: { "test.ns.topic": subHandler1 }
					});

					// --- NAMESPACE A ---
					const broker2 = createBroker(adapter, { nodeID: "int-test-2", namespace: "A" });
					const subHandler2 = jest.fn(() => Promise.resolve());
					broker2.createService({
						name: "sub",
						channels: { "test.ns.topic": subHandler2 }
					});

					// --- NAMESPACE B ---
					const broker3 = createBroker(adapter, { nodeID: "int-test-3", namespace: "B" });
					const subHandler3 = jest.fn(() => Promise.resolve());
					broker3.createService({
						name: "sub",
						channels: { "test.ns.topic": subHandler3 }
					});

					// --- NAMESPACE BUT NO PREFIX ---
					const broker4 = createBroker(
						_.defaultsDeep({ options: { prefix: "" } }, adapter),
						{
							nodeID: "int-test-4",
							namespace: "C"
						}
					);
					const subHandler4 = jest.fn(() => Promise.resolve());
					broker4.createService({
						name: "sub",
						channels: { "test.ns.topic": { group: "other", handler: subHandler4 } }
					});

					// --- NO NAMESPACE BUT PREFIX ---
					const broker5 = createBroker(
						_.defaultsDeep({ options: { prefix: "C" } }, adapter),
						{ nodeID: "int-test-5" }
					);
					const subHandler5 = jest.fn(() => Promise.resolve());
					broker5.createService({
						name: "sub",
						channels: { "test.ns.topic": { handler: subHandler5 } }
					});

					beforeAll(() =>
						broker1.Promise.mapSeries(
							[broker1, broker2, broker3, broker4, broker5],
							async broker => {
								await broker.start();
								await broker.Promise.delay(DELAY_AFTER_BROKER_START);
							}
						)
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
						// Because of NATS JetStream balancing this test is more flexible
						// Idea copied from NATS JetStream repo
						// More info: https://github.com/nats-io/nats.deno/blob/df44a494a2d19284e80e8ae9baddff1fb15f6897/tests/jetstream_test.ts#L1729-L1762
						expect(subHandler1.mock.calls.length).toBeGreaterThanOrEqual(0);
						// expect(subHandler1).toHaveBeenCalledTimes(2);
						expect(subHandler2).toHaveBeenCalledTimes(0);
						expect(subHandler3).toHaveBeenCalledTimes(0);
						expect(subHandler4.mock.calls.length).toBeGreaterThanOrEqual(0);
						// expect(subHandler4).toHaveBeenCalledTimes(2);
						expect(subHandler5).toHaveBeenCalledTimes(0);

						expect(
							subHandler1.mock.calls.length + subHandler4.mock.calls.length
						).toEqual(4);
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
						// Because of NATS JetStream balancing this test is more flexible
						// Idea copied from NATS JetStream repo
						// More info: https://github.com/nats-io/nats.deno/blob/df44a494a2d19284e80e8ae9baddff1fb15f6897/tests/jetstream_test.ts#L1729-L1762
						expect(subHandler1.mock.calls.length).toBeGreaterThanOrEqual(0);
						// expect(subHandler1).toHaveBeenCalledTimes(2);
						expect(subHandler2).toHaveBeenCalledTimes(0);
						expect(subHandler3).toHaveBeenCalledTimes(0);
						expect(subHandler4.mock.calls.length).toBeGreaterThanOrEqual(0);
						// expect(subHandler4).toHaveBeenCalledTimes(2);
						expect(subHandler5).toHaveBeenCalledTimes(0);

						expect(
							subHandler1.mock.calls.length + subHandler4.mock.calls.length
						).toEqual(4);
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

				describe("Test Dead Letter logic without retries", () => {
					const broker = createBroker(adapter, { logLevel: "debug" });

					const error = new Error("Something happened");
					const deadLetterHandler = jest.fn(() => Promise.resolve());
					const subWrongHandler = jest.fn(() => Promise.reject(error));

					broker.createService({
						name: "sub1",
						channels: {
							"test.failed_messages.topic": {
								group: "mygroup",
								redis: {
									claimInterval: 50
								},
								maxRetries: 0,
								deadLettering: {
									enabled: true,
									queueName: "DEAD_LETTER",
									exchangeName: "DEAD_LETTER"
								},
								handler: subWrongHandler
							}
						}
					});

					broker.createService({
						name: "sub2",
						channels: {
							DEAD_LETTER: {
								handler: deadLetterHandler
							}
						}
					});

					beforeAll(() => broker.start().delay(DELAY_AFTER_BROKER_START));
					afterAll(() => broker.stop());

					beforeEach(() => {
						deadLetterHandler.mockClear();
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

						expect(deadLetterHandler).toHaveBeenCalledTimes(1);

						await broker.Promise.delay(500);
					});
				});

				describe("Test Dead Letter logic with retries", () => {
					const broker = createBroker(adapter);

					const error = new Error("Something happened");
					const deadLetterHandler = jest.fn(() => Promise.resolve());
					const subWrongHandler = jest.fn(() => Promise.reject(error));

					broker.createService({
						name: "sub1",
						channels: {
							"test.failed_messages.topic": {
								group: "mygroup",
								maxRetries: 2,
								redis: {
									minIdleTime: 50,
									claimInterval: 50,
									processingAttemptsInterval: 10
								},
								deadLettering: {
									enabled: true,
									queueName: "DEAD_LETTER",
									exchangeName: "DEAD_LETTER"
								},
								handler: subWrongHandler
							}
						}
					});

					broker.createService({
						name: "sub2",
						channels: {
							DEAD_LETTER: {
								handler: deadLetterHandler
							}
						}
					});

					beforeAll(() => broker.start().delay(DELAY_AFTER_BROKER_START));
					afterAll(() => broker.stop());

					beforeEach(() => {
						deadLetterHandler.mockClear();
						subWrongHandler.mockClear();
					});

					it("should transfer to DEAD_LETTER", async () => {
						const msg = {
							id: 1,
							name: "John",
							age: 2565
						};
						// ---- ^ SETUP ^ ---

						await broker.Promise.delay(500);

						broker.sendToChannel("test.failed_messages.topic", msg);
						await broker.Promise.delay(1000);

						// ---- ˇ ASSERTS ˇ ---
						expect(subWrongHandler).toHaveBeenCalledTimes(2);

						expect(deadLetterHandler).toHaveBeenCalledTimes(1);

						await broker.Promise.delay(500);
					});
				});
			}
		});
	}
});

if (process.env.GITHUB_ACTIONS_CI && process.env.ADAPTER == "Multi") {
	describe("Multiple Adapters", () => {
		const broker = new ServiceBroker({
			logger: true,
			logLevel: "error",
			middlewares: [
				// Default options
				ChannelMiddleware({
					channelHandlerTrigger: "myTriggerA",
					adapter: { type: "Redis", options: {} }
				}),
				ChannelMiddleware({
					adapter: "Redis",
					schemaProperty: "redisChannels",
					sendMethodName: "sendToRedisChannel",
					adapterPropertyName: "redisAdapter",
					channelHandlerTrigger: "myTriggerB"
				}),
				ChannelMiddleware({
					adapter: "AMQP",
					schemaProperty: "amqpChannels",
					sendMethodName: "sendToAMQPChannel",
					adapterPropertyName: "amqpAdapter",
					channelHandlerTrigger: "myTriggerC"
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

		beforeAll(() => broker.start().delay(DELAY_AFTER_BROKER_START));
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
}

async function createKafkaTopics(adapter, defs) {
	const kafka = new Kafka({
		clientId: "moleculer-channel-test",
		brokers: adapter.options.kafka.brokers
	});
	const admin = kafka.admin();

	await admin.connect();
	const topics = await admin.listTopics();
	defs = defs.filter(def => !topics.includes(def.topic));
	await admin.createTopics({
		topics: defs
	});
	await admin.disconnect();
}
