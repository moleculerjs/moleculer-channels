"use strict";

/**
 * Kafka Balanced Consumption Example
 *
 * Demonstrates that 3 services in the same consumer group
 * each receive a balanced share of messages when the topic
 * is pre-created with at least 3 partitions.
 *
 * Pre-requisites:
 *   - Kafka running at localhost:9093
 *   - The topic "order.events" must have >= 3 partitions.
 *     It will be auto-created with 3 partitions on first subscribe
 *     if it does not exist yet.
 *
 * Run:  node examples/kafka-balanced/index.js
 */

const { ServiceBroker } = require("moleculer");
const ChannelsMiddleware = require("../../").Middleware;

const TOPIC = "order.events";
const GROUP = "order-processors";

const messageCounter = new Map();

function createWorkerBroker(workerId) {
	const broker = new ServiceBroker({
		nodeID: `worker-${workerId}`,
		logLevel: "info",
		middlewares: [
			ChannelsMiddleware({
				adapter: {
					type: "Kafka",
					options: {
						kafka: {
							bootstrapBrokers: ["localhost:9093"]
							// Pre-create the topic with 3 partitions so each
							// worker can own at least one partition.
							// (Only used when the topic doesn't exist yet.)
						}
					}
				}
			})
		]
	});

	broker.createService({
		name: `order-processor-${workerId}`,
		channels: {
			[TOPIC]: {
				group: GROUP,
				// kafka.partitions is used only when auto-creating the topic
				kafka: { partitions: 3 },
				async handler(payload) {
					broker.logger.info(
						`[worker-${workerId}] Received order #${payload.id} — ${payload.item}`
					);
					messageCounter.set(workerId, (messageCounter.get(workerId) || 0) + 1);
				}
			}
		}
	});

	return broker;
}

async function main() {
	// Three workers share the same consumer group → balanced distribution
	const brokers = [createWorkerBroker(1), createWorkerBroker(2), createWorkerBroker(3)];

	// Producer broker (no channel subscriptions, just publishes)
	const producerBroker = new ServiceBroker({
		nodeID: "producer",
		logLevel: "info",
		middlewares: [
			ChannelsMiddleware({
				adapter: {
					type: "Kafka",
					options: { kafka: { bootstrapBrokers: ["localhost:9093"] } }
				}
			})
		]
	});

	await Promise.all([...brokers.map(b => b.start()), producerBroker.start()]);

	// Allow time for consumer group rebalancing before sending messages
	producerBroker.logger.info("Waiting for consumer group to stabilise...");
	await new Promise(r => setTimeout(r, 6000));

	// Send 30 messages — ideally each worker handles ~10
	producerBroker.logger.info("Sending 20 orders...");
	const sends = [];
	for (let i = 1; i <= 20; i++) {
		sends.push(
			producerBroker.sendToChannel(
				TOPIC,
				{ id: i, item: `product-${i}` },
				{ key: String(i), autocreateTopics: false }
			)
		);
	}
	await Promise.all(sends);

	// Wait for all messages to be processed
	await new Promise(r => setTimeout(r, 5000));

	// Log the message count for each worker
	messageCounter.forEach((count, workerId) => {
		producerBroker.logger.info(`[worker-${workerId}] Processed ${count} messages.`);
	});

	await Promise.all([...brokers.map(b => b.stop()), producerBroker.stop()]);
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});
