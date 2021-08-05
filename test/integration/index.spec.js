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
					await broker.Promise.delay(1000);

					// ---- ˇ ASSERTS ˇ ---
					expect(subWrongHandler.mock.calls.length).toBeGreaterThan(2);

					expect(subGoodHandler).toHaveBeenCalledTimes(6);
					expect(subGoodHandler).toHaveBeenCalledWith({ id: 0 });
					expect(subGoodHandler).toHaveBeenCalledWith({ id: 1 });
					expect(subGoodHandler).toHaveBeenCalledWith({ id: 2 });
					expect(subGoodHandler).toHaveBeenCalledWith({ id: 3 });
					expect(subGoodHandler).toHaveBeenCalledWith({ id: 4 });
					expect(subGoodHandler).toHaveBeenCalledWith({ id: 5 });
				});
			});

			if (adapter.type != "AMQP") {
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
						const msg = {
							id: 1,
							name: "John",
							age: 25
						};

						// Publish the messages
						await Promise.all(
							_.times(6, () =>
								broker.sendToChannel("test.delayed.connection.topic", msg)
							)
						);
						await broker.Promise.delay(200);

						// Create and start the service
						const svc1 = broker.createService({
							name: "sub1",
							channels: {
								"test.delayed.connection.topic": {
									group: "mygroup",
									handler: sub1Handler
								}
							}
						});
						await broker.Promise.delay(200);
						// ---- ^ SETUP ^ ---

						// ---- ˇ ASSERTS ˇ ---
						expect(sub1Handler).toHaveBeenCalledTimes(6);

						// Server is going down
						await broker.destroyService(svc1);
						await broker.Promise.delay(200);

						// In mean time, more messages are being publish
						await Promise.all(
							_.times(6, () =>
								broker.sendToChannel("test.delayed.connection.topic", msg)
							)
						);
						await broker.Promise.delay(200);

						// Service replica is starting
						const svc2 = broker.createService({
							name: "sub1",
							channels: {
								"test.delayed.connection.topic": {
									group: "mygroup",
									handler: sub2Handler
								}
							}
						});
						await broker.Promise.delay(200);

						expect(sub2Handler).toHaveBeenCalledTimes(6);
					});
				});
			}
		});
	}
});
