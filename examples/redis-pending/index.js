"use strict";

// Adapted from: https://github.com/moleculerjs/moleculer-channels/issues/74

const { ServiceBroker } = require("moleculer");
const ChannelsMiddleware = require("../../types").Middleware;
const broker = new ServiceBroker({
	namespace: "test",
	nodeID: "test1",
	transporter: "TCP",
	middlewares: [
		ChannelsMiddleware({
			adapter: "redis://127.0.0.1:6379"
		})
	]
});

const serviceSchema = {
	name: "subscriber",
	channels: {
		"order.created": {
			group: "mygroup",
			redis: {
				minIdleTime: 1000,
				claimInterval: 1,
				startID: "0"
			},
			maxRetries: 100,
			handler(payload) {
				this.logger.info("Received order.created event", payload);
				throw new Error();
			}
		}
	}
};
broker.createService(serviceSchema);

// Start the Moleculer broker
broker.start().then(async () => {
	try {
		broker.repl();

		for (let i = 0; i < 10; i++) {
			await broker.sendToChannel("order.created", { id: i, items: "test" });

			await broker.Promise.delay(100);
		}

		await broker.destroyService("subscriber");

		setTimeout(() => {
			broker.logger.info("Recreate service");
			broker.createService(serviceSchema);
		}, 10000);
	} catch (error) {
		console.log(error);
	}
});
