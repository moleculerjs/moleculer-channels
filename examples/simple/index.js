"use strict";

const { ServiceBroker } = require("moleculer");
const ChannelsMiddleware = require("../../");

// Create broker
const broker = new ServiceBroker({
	middlewares: [ChannelsMiddleware()]
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
			// adapter: "kafka://kafka:9092",
			async handler(msg) {
				this.logger.info("Channel Two msg received", msg);
			}
		}
	}
});

broker.start().then(async () => {
	broker.repl();
});
