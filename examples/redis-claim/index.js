"use strict";

const { ServiceBroker } = require("moleculer");
const ChannelsMiddleware = require("../../").Middleware;

const Sub2Schema = require("./stable.service");

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
				await broker.sendToChannel("test.unstable.topic", {
					id: 2,
					name: "Jane Doe",
					status: false,
					count: ++c,
					pid: process.pid
				});
			}
		}
	]
});

broker.createService({
	name: "sub1",
	channels: {
		"test.unstable.topic": {
			group: "mygroup",
			handler() {
				this.logger.error("Ups! Something happened");
				return Promise.reject(new Error("Something happened"));
			}
		}
	}
});

broker.createService(Sub2Schema);

broker
	.start()
	.then(() => {
		broker.repl();
	})
	.catch(err => {
		broker.logger.error(err);
		broker.stop();
	});
