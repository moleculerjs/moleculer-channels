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
			adapter: {
				type: "Redis",
				options: {
					redis: "localhost:6379",
					serializer: "MsgPack"
				}
			}
		})
	],
	replCommands: [
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

				await broker.sendToChannel("my.fail.topic", payload, { headers: { a: "123" } });
			}
		}
	]
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
			maxRetries: 0,
			deadLettering: {
				enabled: true,
				queueName: "DEAD_LETTER",
				exchangeName: "DEAD_LETTER"
			},
			handler(msg, raw) {
				this.logger.error("Processing...", msg);

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
			group: "failgroup",
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
	.then(async () => {
		broker.repl();

		const payload = {
			id: 2,
			name: "Jane Doe",
			status: false,
			count: ++c,
			pid: process.pid
		};

		// await broker.sendToChannel("my.fail.topic", payload, { headers: { a: "123" } });
	})
	.catch(err => {
		broker.logger.error(err);
		broker.stop();
	});
