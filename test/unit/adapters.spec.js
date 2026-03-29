"use strict";

const RedisAdapter = require("../../src/adapters/redis");
const AmqpAdapter = require("../../src/adapters/amqp");
const NatsAdapter = require("../../src/adapters/nats");
const KafkaAdapter = require("../../src/adapters/kafka");
const FakeAdapter = require("../../src/adapters/fake");

describe("Adapter constructor string URL handling", () => {
	describe("Redis adapter", () => {
		it("should parse string URL into opts.redis.url", () => {
			const adapter = new RedisAdapter("redis://myhost:6379");
			expect(adapter.opts.redis.url).toBe("redis://myhost:6379");
		});

		it("should work with object form", () => {
			const adapter = new RedisAdapter({ redis: { url: "redis://myhost:6379" } });
			expect(adapter.opts.redis.url).toBe("redis://myhost:6379");
		});
	});

	describe("AMQP adapter", () => {
		it("should parse string URL into opts.amqp.url", () => {
			const adapter = new AmqpAdapter("amqp://myhost:5672");
			expect(adapter.opts.amqp.url).toEqual(["amqp://myhost:5672"]);
		});

		it("should parse semicolon-separated URLs", () => {
			const adapter = new AmqpAdapter("amqp://host1:5672;amqp://host2:5672");
			expect(adapter.opts.amqp.url).toEqual(["amqp://host1:5672", "amqp://host2:5672"]);
		});

		it("should work with object form", () => {
			const adapter = new AmqpAdapter({ amqp: { url: "amqp://myhost:5672" } });
			expect(adapter.opts.amqp.url).toEqual(["amqp://myhost:5672"]);
		});
	});

	describe("NATS adapter", () => {
		it("should parse string URL into opts.nats.url", () => {
			const adapter = new NatsAdapter("nats://myhost:4222");
			expect(adapter.opts.nats.url).toBe("nats://myhost:4222");
			expect(adapter.opts.nats.connectionOptions.servers).toEqual(["myhost:4222"]);
		});

		it("should parse comma-separated URLs", () => {
			const adapter = new NatsAdapter("nats://host1:4222,nats://host2:4222");
			expect(adapter.opts.nats.connectionOptions.servers).toEqual([
				"host1:4222",
				"host2:4222"
			]);
		});

		it("should work with object form", () => {
			const adapter = new NatsAdapter({
				nats: { url: "nats://myhost:4222" }
			});
			expect(adapter.opts.nats.url).toBe("nats://myhost:4222");
			expect(adapter.opts.nats.connectionOptions.servers).toEqual(["myhost:4222"]);
		});
	});

	describe("Kafka adapter", () => {
		it("should parse string URL into opts.kafka.brokers", () => {
			const adapter = new KafkaAdapter("kafka://myhost:9092");
			expect(adapter.opts.kafka.brokers).toEqual(["myhost:9092"]);
		});

		it("should work with object form", () => {
			const adapter = new KafkaAdapter({
				kafka: { brokers: ["myhost:9092"] }
			});
			expect(adapter.opts.kafka.brokers).toEqual(["myhost:9092"]);
		});
	});

	describe("Fake adapter", () => {
		it("should accept string and ignore it", () => {
			const adapter = new FakeAdapter("Fake");
			expect(adapter.opts).toBeDefined();
		});

		it("should accept empty object", () => {
			const adapter = new FakeAdapter({});
			expect(adapter.opts).toBeDefined();
		});
	});
});
