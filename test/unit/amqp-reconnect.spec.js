"use strict";

/**
 * Unit tests for AMQP adapter recovery when the broker closes the channel
 * without closing the underlying connection.
 *
 * Regression: when only the channel was closed (e.g. `assertExchange` failure,
 * publish to a non-existent exchange, server-side preconditions), the adapter
 * left `this.channel` pointing at a dead channel and `this.connected = true`,
 * so subsequent `publish()` calls threw `IllegalOperationError` indefinitely.
 *
 * The fix re-uses the existing connection-level reconnect machinery by closing
 * the connection from the channel `close` handler. We assert here that the
 * channel handler triggers `connection.close()` when the adapter is not
 * stopping.
 */

const EventEmitter = require("events");
const { ServiceBroker } = require("moleculer");

const mockConnect = jest.fn();

jest.mock("amqplib", () => ({
	connect: (...args) => mockConnect(...args)
}));

const AmqpAdapter = require("../../src/adapters/amqp");

function createFakeConnection() {
	const conn = new EventEmitter();
	conn.close = jest.fn().mockResolvedValue();
	conn.createChannel = jest.fn();
	return conn;
}

function createFakeChannel() {
	const ch = new EventEmitter();
	ch.prefetch = jest.fn().mockResolvedValue();
	ch.close = jest.fn().mockResolvedValue();
	return ch;
}

async function setupAdapter() {
	const broker = new ServiceBroker({ logger: false });
	await broker.start();

	const adapter = new AmqpAdapter({ amqp: { url: "amqp://localhost:5672" } });
	adapter.init(broker, broker.logger);

	const conn = createFakeConnection();
	const channel = createFakeChannel();
	conn.createChannel.mockResolvedValue(channel);
	mockConnect.mockResolvedValue(conn);

	await adapter.tryConnect();

	return { broker, adapter, conn, channel };
}

describe("AMQP adapter — channel close recovery", () => {
	beforeEach(() => {
		mockConnect.mockReset();
	});

	it("should close the connection when the channel emits 'close' and adapter is not stopping", async () => {
		const { broker, adapter, conn, channel } = await setupAdapter();

		const errorSpy = jest.spyOn(adapter.logger, "error");

		expect(adapter.connected).toBe(true);
		expect(adapter.channel).toBe(channel);

		// Simulate broker closing the channel without closing the connection
		channel.emit("close");

		expect(conn.close).toHaveBeenCalledTimes(1);
		expect(errorSpy).toHaveBeenCalledWith(
			expect.stringContaining("AMQP channel closed unexpectedly")
		);

		await broker.stop();
	});

	it("should NOT close the connection when channel closes during a graceful shutdown", async () => {
		const { broker, adapter, conn, channel } = await setupAdapter();

		adapter.stopping = true;
		channel.emit("close");

		expect(conn.close).not.toHaveBeenCalled();

		await broker.stop();
	});

	it("should swallow errors from connection.close() invoked from the channel-close handler", async () => {
		const { broker, adapter, conn, channel } = await setupAdapter();

		conn.close.mockRejectedValue(new Error("already-closed"));
		const debugSpy = jest.spyOn(adapter.logger, "debug");

		// Should not throw / not produce an unhandled rejection
		channel.emit("close");

		// Give the rejection a tick to surface
		await new Promise(r => setImmediate(r));

		expect(conn.close).toHaveBeenCalledTimes(1);
		expect(debugSpy).toHaveBeenCalledWith(
			expect.stringContaining("Error while closing connection after channel close."),
			expect.any(Error)
		);

		await broker.stop();
	});
});
