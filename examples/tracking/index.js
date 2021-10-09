"use strict";

const { ServiceBroker } = require("moleculer");
const ChannelsMiddleware = require("../..").Middleware;

let c = 1;

// Create broker
const broker = new ServiceBroker({
	logLevel: {
		CHANNELS: "debug",
		"**": "info"
	},
	middlewares: [
		ChannelsMiddleware({
			adapter: process.env.ADAPTER || "redis://localhost:6379"
		})
	],
	replCommands: [
		{
			command: "publish",
			alias: ["p"],
			async action(broker, args) {
				const { options } = args;
				//console.log(options);
				const payload = {
					id: 2,
					name: "Jane Doe",
					status: false,
					count: ++c,
					pid: process.pid
				};

				await broker.sendToChannel("my.tracked.topic", payload);
			}
		}
	]
});

broker.createService({
	name: "sub1",
	channels: {
		"my.tracked.topic": {
			maxInFlight: 10,
			async handler() {
				this.logger.info(">>> Start processing message. It will takes 10s...");
				await this.Promise.delay(10 * 1000);
				this.logger.info(">>> Processing finished.");
			}
		}
	}
});

broker
	.start()
	.then(() => {
		broker.repl();
	})
	.catch(err => {
		broker.logger.error(err);
		broker.stop();
	});
