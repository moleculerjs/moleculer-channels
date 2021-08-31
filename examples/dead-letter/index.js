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

				await broker.sendToChannel("my.fail.topic", payload);
			}
		}
	]
});

broker.createService({
	name: "sub1",
	channels: {
		"my.fail.topic": {
			group: "mygroup",
			minIdleTime: 1000,
			claimInterval: 500,
			maxRetries: 3,
			deadLettering: {
				enabled: true,
				queueName: "DEAD_LETTER",
				exchangeName: "DEAD_LETTER"
			},
			handler() {
				this.logger.error("Ups! Something happened");
				return Promise.reject(new Error("Something happened"));
			}
		}
	}
});

broker.createService({
	name: "sub2",
	channels: {
		DEAD_LETTER: {
			group: "mygroup",
			handler(msg, raw) {
				this.logger.info("--> FAILED HANDLER <--");
				this.logger.info(msg);
				// Send a notification about the failure

				this.logger.info("--> RAW (ENTIRE) MESSAGE <--");
				this.logger.info(raw);
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
