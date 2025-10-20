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
	replOptions: {
		customCommands: [
			{
				command: "publish",
				alias: ["p"],
				async action(broker, args) {
					const payload = {
						id: 2,
						name: "Jane Doe",
						status: false,
						count: ++c,
						pid: process.pid
					};

					await broker.sendToChannel("my.fail.topic", payload, {
						key: "" + c,
						headers: { a: "123" }
					});
				}
			}
		]
	}
});

broker.createService({
	name: "sub1",
	channels: {
		"my.fail.topic": {
			group: "failgroup",
			redis: {
				minIdleTime: 1000,
				claimInterval: 500
			},
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

/**
broker.createService({
	name: "sub2",
	channels: {
		"my.fail.topic": {
			group: "goodgroup",
			handler(msg) {
				this.logger.info(">>> I processed", msg);
			}
		}
	}
});
*/

broker.createService({
	name: "sub3",
	channels: {
		DEAD_LETTER: {
			context: true,
			group: "failgroup",
			handler(ctx, raw) {
				this.logger.info("--> FAILED HANDLER PARAMS <--");
				this.logger.info(ctx.params);
				this.logger.info("--> FAILED HANDLER HEADERS <--");
				this.logger.info(ctx.headers);

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
