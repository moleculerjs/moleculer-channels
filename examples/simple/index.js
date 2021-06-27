"use strict";

const { ServiceBroker } = require("moleculer");
const ChannelsMiddleware = require("../../").Middleware;

// Create broker
const broker = new ServiceBroker({
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
			this.logger.info("Channel One msg received", msg);
		},

		"my.second.topic": {
			group: "other",
			// maxInFlight: 1,
			async handler(msg) {
				this.logger.info("Channel Two msg received", msg);
			}
		}
	}
});

broker
	.start()
	.then(async () => {
		broker.repl();
	})
	.catch(err => {
		broker.logger.error(err);
		broker.stop();
	});
