"use strict";

const _ = require("lodash");
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
	function createBroker(adapter, opts) {
		return new ServiceBroker(
			_.defaultsDeep(opts, {
				logger: true,
				logLevel: "error",
				middlewares: [ChannelMiddleware({ adapter })]
			})
		);
	}

	for (const adapter of Adapters) {
		describe(`Adapter: ${adapter.name || adapter.type}`, () => {
			describe("Test simple publish/subscribe logic", () => {
				const broker = createBroker(adapter);

				const subTestTopicHandler = jest.fn(() => Promise.resolve());

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
					expect(subTestTopicHandler).toHaveBeenCalledWith(msg);
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
					expect(sub1TestTopic1Handler).toHaveBeenCalledWith(msg);

					expect(sub2TestTopic1Handler).toHaveBeenCalledTimes(1);
					expect(sub2TestTopic1Handler).toHaveBeenCalledWith(msg);

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
					expect(sub1TestTopic2Handler).toHaveBeenCalledWith(msg);

					expect(sub2TestTopic2Handler).toHaveBeenCalledTimes(1);
					expect(sub2TestTopic2Handler).toHaveBeenCalledWith(msg);

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
					await broker.Promise.delay(200);

					// ---- ˇ ASSERTS ˇ ---
					expect(sub1Handler).toHaveBeenCalledTimes(2);
					expect(sub1Handler).toHaveBeenCalledWith(msg);

					expect(sub2Handler).toHaveBeenCalledTimes(2);
					expect(sub2Handler).toHaveBeenCalledWith(msg);

					expect(sub3Handler).toHaveBeenCalledTimes(2);
					expect(sub3Handler).toHaveBeenCalledWith(msg);
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
					expect(subGoodHandler).toHaveBeenCalledTimes(6);
					expect(subGoodHandler).toHaveBeenCalledWith({ id: 0 });
					expect(subGoodHandler).toHaveBeenCalledWith({ id: 1 });
					expect(subGoodHandler).toHaveBeenCalledWith({ id: 2 });
					expect(subGoodHandler).toHaveBeenCalledWith({ id: 3 });
					expect(subGoodHandler).toHaveBeenCalledWith({ id: 4 });
					expect(subGoodHandler).toHaveBeenCalledWith({ id: 5 });

					expect(subWrongHandler.mock.calls.length).toBeGreaterThan(2);
				});
			});

			//if (adapter.type != "AMQP") {
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
					expect(sub1Handler).toHaveBeenCalledWith({ id: 0 });
					expect(sub1Handler).toHaveBeenCalledWith({ id: 1 });
					expect(sub1Handler).toHaveBeenCalledWith({ id: 2 });
					expect(sub1Handler).toHaveBeenCalledWith({ id: 3 });
					expect(sub1Handler).toHaveBeenCalledWith({ id: 4 });
					expect(sub1Handler).toHaveBeenCalledWith({ id: 5 });

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
					const svc2 = broker.createService({
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
					expect(sub2Handler).toHaveBeenCalledWith({ id: 6 });
					expect(sub2Handler).toHaveBeenCalledWith({ id: 7 });
					expect(sub2Handler).toHaveBeenCalledWith({ id: 8 });
					expect(sub2Handler).toHaveBeenCalledWith({ id: 9 });
					expect(sub2Handler).toHaveBeenCalledWith({ id: 10 });
					expect(sub2Handler).toHaveBeenCalledWith({ id: 11 });
				});
			});
			//}

			if (adapter.type != "AMQP") {
				describe("Test Failed Message logic", () => {
					const broker = createBroker(adapter);

					const error = new Error("Something happened");
					const subWrongHandler = jest.fn(() => Promise.reject(error));

					beforeAll(() => broker.start());
					afterAll(() => broker.stop());

					beforeEach(() => {
						subWrongHandler.mockClear();
					});

					it("should place message into FAILED LIST", async () => {
						// -> Create and start the service to register consumer groups and queues <- //
						broker.createService({
							name: "sub1",
							channels: {
								"test.fail.topic": {
									maxInFlight: 1,
									minIdleTime: 50,
									claimInterval: 50,
									maxProcessingAttempts: 6,
									processingAttemptsInterval: 10,
									handler: subWrongHandler
								}
							}
						});

						await broker.Promise.delay(500);
						// -> Publish a message <- //
						await broker.sendToChannel("test.fail.topic", { test: 1 });
						await broker.Promise.delay(1000);

						// ---- ˇ ASSERT ˇ ---
						expect(subWrongHandler).toHaveBeenCalledTimes(6);
					});
				});
			}
		});
	}
});
