"use strict";

const { ServiceBroker } = require("moleculer");
const ChannelsMiddleware = require("../../").Middleware;

// Create broker
const broker = new ServiceBroker({
	logLevel: "debug",
	middlewares: [
		ChannelsMiddleware({
			adapter: "redis://localhost:6379"
		})
	]
});

broker.createService({
	name: "posts",
	version: 1,
	channels: {
		async "my.first.topic"(msg) {
			this.logger.info("[POSTS] Channel One msg received", msg);
		},

		"my.second.topic": {
			group: "other",
			// maxInFlight: 1,
			async handler(msg) {
				this.logger.info("[POSTS] Channel Two msg received", msg);
			}
		}
	}
});

broker.createService({
	name: "users",
	channels: {
		async "my.first.topic"(msg) {
			this.logger.info("[USERS] Channel One msg received", msg);
		},

		"my.second.topic": {
			group: "other",
			// maxInFlight: 1,
			async handler(msg) {
				this.logger.info("[USERS] Channel Two msg received", msg);
			}
		}
	}
});

broker
	.start()
	.then(async () => {
		broker.repl();

		await Promise.delay(1000);
		console.log("Publish 'my.first.topic' message...");
		await broker.sendToChannel("my.first.topic", { id: 1, name: "John Doe", status: true });

		await Promise.delay(5000);
		console.log("Publish 'my.second.topic' message...");
		await broker.sendToChannel("my.second.topic", { id: 2, name: "Jane Doe", status: true });
	})
	.catch(err => {
		broker.logger.error(err);
		broker.stop();
	});
