"use strict";

const _ = require("lodash");
const { ServiceBroker } = require("moleculer");
const ChannelsMiddleware = require("../..").Middleware;

let c = 1;

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

				// await broker.sendToChannel("test.unstable.topic", payload);

				await Promise.all(
					_.times(10, id => broker.sendToChannel("test.unstable.topic", { id }))
				);
			}
		}
	]
});

broker.createService({
	name: "sub1",
	channels: {
		"test.unstable.topic": {
			group: "mygroup",
			maxRetries: 5,
			handler(payload, raw) {
				this.logger.error(
					`Ups! Something happened messageID:${payload.id} || JS_SequenceID:${raw.seq}`
				);
				return Promise.reject(new Error("Something happened"));
			}
		}
	}
});

broker.createService({
	name: "sub2",
	channels: {
		"test.unstable.topic": {
			group: "mygroup",
			// Defaults to 1 hour. Decrease for unit tests
			minIdleTime: 10,
			claimInterval: 10,
			maxRetries: 5,
			handler(msg) {
				this.logger.info(msg);
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
