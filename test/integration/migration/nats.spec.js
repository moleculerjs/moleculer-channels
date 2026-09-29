import _ from "lodash";
import { ServiceBroker } from "moleculer";
import { Middleware as ChannelMiddleware } from "./../../../";
import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";

// These tests upgrade a NATS JetStream server prepared by the previous (v2) adapter
// version or by a previous run. They run in the NATS adapter job of the integration
// workflow, where a NATS server with JetStream is available.
const RUN_NATS_TESTS = process.env.GITHUB_ACTIONS_CI && process.env.ADAPTER == "NATS";

describe.skipIf(!RUN_NATS_TESTS)("NATS JetStream upgrade & migration logic", () => {
	function createBroker(opts) {
		return new ServiceBroker(
			_.defaultsDeep(opts, {
				nodeID: "nats-migration-test",
				logger: false,
				logLevel: "debug",
				middlewares: [
					ChannelMiddleware({
						adapter: { type: "NATS", options: {} }
					})
				]
			})
		);
	}

	/** Direct NATS connection for JetStream setup & assertions */
	let nc;
	let jsm;

	async function deleteStreamIfExists(name) {
		try {
			await jsm.streams.delete(name);
		} catch {
			// Stream does not exist
		}
	}

	beforeAll(async () => {
		const { connect } = await import("@nats-io/transport-node");
		const { jetstreamManager } = await import("@nats-io/jetstream");

		nc = await connect({ servers: "127.0.0.1:4222" });
		jsm = await jetstreamManager(nc);
	});

	afterAll(async () => {
		if (nc) {
			await nc.drain();
			await nc.close();
		}
	});

	it("should start when the pull consumer already exists from a previous run", async () => {
		const streamName = "test.restart.topic";
		const durableName = "restart-group_test_restart_topic";

		// Simulate the state left behind by a previous run of the adapter: the durable
		// pull consumer exists and still carries the `by_start_sequence` policy of a
		// former legacy-consumer migration. The `deliver_policy` differs from the
		// desired one, so a naive consumer update would be rejected by the server
		// ("consumer delivery policy is deliver new, but optional start sequence is
		// also set").
		await deleteStreamIfExists("test_restart_topic");
		await jsm.streams.add({ name: "test_restart_topic", subjects: [streamName] });
		await jsm.consumers.add("test_restart_topic", {
			durable_name: durableName,
			filter_subject: streamName,
			ack_policy: "explicit",
			deliver_policy: "by_start_sequence",
			opt_start_seq: 1,
			max_ack_pending: 50
		});

		const handler = vi.fn(() => Promise.resolve());
		const broker = createBroker();
		broker.createService({
			name: "sub",
			channels: {
				[streamName]: { group: "restart-group", handler }
			}
		});

		await broker.start();
		try {
			await broker.sendToChannel(streamName, { id: 1 });
			await broker.Promise.delay(500);

			expect(handler).toHaveBeenCalledWith({ id: 1 }, expect.anything());

			// The consumer still exists, immutable fields are untouched while
			// mutable fields are updated
			const ci = await jsm.consumers.info("test_restart_topic", durableName);
			expect(ci.config.deliver_policy).toBe("by_start_sequence");
			expect(ci.config.opt_start_seq).toBe(1);
			expect(ci.config.max_ack_pending).toBe(1);
		} finally {
			await broker.stop();
			await deleteStreamIfExists("test_restart_topic");
		}
	});

	it("should deliver messages to the correct handler when two channels share a stream and a group", async () => {
		await deleteStreamIfExists("shared-stream");

		const abcHandler = vi.fn(() => Promise.resolve());
		const xyzHandler = vi.fn(() => Promise.resolve());
		const broker = createBroker();

		broker.createService({
			name: "sub",
			channels: {
				"shr.abc": {
					group: "shared-group",
					nats: {
						streamConfig: { name: "shared-stream", subjects: ["shr.abc", "shr.xyz"] }
					},
					handler: abcHandler
				},
				"shr.xyz": {
					group: "shared-group",
					nats: {
						streamConfig: { name: "shared-stream", subjects: ["shr.abc", "shr.xyz"] }
					},
					handler: xyzHandler
				}
			}
		});

		await broker.start();
		try {
			await broker.sendToChannel("shr.abc", { topic: "abc" });
			await broker.sendToChannel("shr.xyz", { topic: "xyz" });
			await broker.Promise.delay(500);

			expect(abcHandler).toHaveBeenCalledTimes(1);
			expect(abcHandler).toHaveBeenCalledWith({ topic: "abc" }, expect.anything());
			expect(xyzHandler).toHaveBeenCalledTimes(1);
			expect(xyzHandler).toHaveBeenCalledWith({ topic: "xyz" }, expect.anything());

			// Each channel got its own durable consumer on the shared stream
			const consumers = await jsm.consumers.list("shared-stream").next();
			expect(consumers.map(c => c.config.durable_name).sort()).toEqual([
				"shared-group_shr_abc",
				"shared-group_shr_xyz"
			]);
		} finally {
			await broker.stop();
			await deleteStreamIfExists("shared-stream");
		}
	});

	it("should subscribe to a stream that already exists under a custom name", async () => {
		await deleteStreamIfExists("custom-named-stream");

		// The stream was created by an operator or another service under a custom name,
		// so the stream creation fails with "subjects overlap with an existing stream"
		// and the stream must be looked up by subject
		await jsm.streams.add({ name: "custom-named-stream", subjects: ["custom.topic"] });

		const handler = vi.fn(() => Promise.resolve());
		const broker = createBroker();
		broker.createService({
			name: "sub",
			channels: {
				"custom.topic": handler
			}
		});

		await broker.start();
		try {
			await broker.sendToChannel("custom.topic", { id: 1 });
			await broker.Promise.delay(500);

			expect(handler).toHaveBeenCalledWith({ id: 1 }, expect.anything());
		} finally {
			await broker.stop();
			await deleteStreamIfExists("custom-named-stream");
		}
	});

	it("should migrate a legacy push consumer created by the v2 adapter", async () => {
		const streamName = "test_legacy_topic";
		await deleteStreamIfExists(streamName);
		await jsm.streams.add({ name: streamName, subjects: ["test.legacy.topic"] });

		// Shape of the consumers created by the v2 adapter: a push consumer named after
		// the consumer group only
		await jsm.consumers.add(streamName, {
			durable_name: "legacy-group",
			filter_subject: "test.legacy.topic",
			deliver_subject: "_inboxes.legacy_migration_test",
			ack_policy: "explicit",
			deliver_policy: "all"
		});

		// Messages published before the upgrade. They are delivered to the legacy push
		// consumer but never acknowledged.
		const { jetstream } = await import("@nats-io/jetstream");
		const jsClient = jetstream(nc);
		await jsClient.publish("test.legacy.topic", JSON.stringify({ id: 0 }));
		await jsClient.publish("test.legacy.topic", JSON.stringify({ id: 1 }));

		const handler = vi.fn(() => Promise.resolve());
		const broker = createBroker();
		broker.createService({
			name: "sub",
			channels: {
				"test.legacy.topic": { group: "legacy-group", handler }
			}
		});

		await broker.start();
		try {
			await broker.sendToChannel("test.legacy.topic", { id: 2 });
			await broker.Promise.delay(1000);

			// The recreated pull consumer resumes from the legacy consumer's last
			// acknowledged message, so the pre-upgrade messages are delivered as well
			expect(handler).toHaveBeenCalledWith({ id: 0 }, expect.anything());
			expect(handler).toHaveBeenCalledWith({ id: 1 }, expect.anything());
			expect(handler).toHaveBeenCalledWith({ id: 2 }, expect.anything());

			// The legacy push consumer is replaced by the pull consumer
			const ci = await jsm.consumers.info(streamName, "legacy-group_test_legacy_topic");
			expect(ci.config.deliver_subject).toBeUndefined();
			await expect(jsm.consumers.info(streamName, "legacy-group")).rejects.toThrow();
		} finally {
			await broker.stop();
			await deleteStreamIfExists(streamName);
		}
	});

	it("should start replicas concurrently while a legacy consumer is migrated", async () => {
		const streamName = "test_race_topic";
		await deleteStreamIfExists(streamName);
		await jsm.streams.add({ name: streamName, subjects: ["test.race.topic"] });

		// Legacy push consumer of the v2 adapter
		await jsm.consumers.add(streamName, {
			durable_name: "race-group",
			filter_subject: "test.race.topic",
			deliver_subject: "_inboxes.race_test",
			ack_policy: "explicit",
			deliver_policy: "all"
		});

		const h1 = vi.fn(() => Promise.resolve());
		const h2 = vi.fn(() => Promise.resolve());

		const broker1 = createBroker({ nodeID: "race-1" });
		const broker2 = createBroker({ nodeID: "race-2" });

		broker1.createService({
			name: "sub1",
			channels: {
				"test.race.topic": { group: "race-group", handler: h1 }
			}
		});
		broker2.createService({
			name: "sub2",
			channels: {
				"test.race.topic": { group: "race-group", handler: h2 }
			}
		});

		await Promise.all([broker1.start(), broker2.start()]);
		try {
			await Promise.all(_.times(10, i => broker1.sendToChannel("test.race.topic", { i })));
			await broker1.Promise.delay(1000);

			// All messages are processed by the two replicas exactly once
			expect(h1.mock.calls.length + h2.mock.calls.length).toEqual(10);
		} finally {
			await Promise.all([broker1.stop(), broker2.stop()]);
			await deleteStreamIfExists(streamName);
		}
	});

	it("should normalize the legacy nested consumerOptions shape", async () => {
		const handler = vi.fn(() => Promise.resolve());
		const broker = new ServiceBroker({
			nodeID: "nats-migration-test",
			logger: false,
			logLevel: "debug",
			middlewares: [
				ChannelMiddleware({
					adapter: {
						type: "NATS",
						options: {
							nats: {
								// Shape shown by the README of the v2 adapter
								consumerOptions: {
									config: {
										deliver_policy: "new",
										ack_policy: "explicit",
										max_ack_pending: 100
									},
									mack: true
								}
							}
						}
					}
				})
			]
		});
		broker.createService({
			name: "sub",
			channels: {
				"test.legacy.opts.topic": handler
			}
		});

		// Newer JetStream servers reject the unknown legacy fields, e.g. "invalid
		// JSON: json: unknown field "config"), and even on tolerant servers the
		// nested settings would be silently ignored. The broker only works when
		// the options are normalized.
		await broker.start();
		try {
			await broker.sendToChannel("test.legacy.opts.topic", { id: 1 });
			await broker.Promise.delay(500);

			expect(handler).toHaveBeenCalledWith({ id: 1 }, expect.anything());
		} finally {
			await broker.stop();
		}
	});
});
