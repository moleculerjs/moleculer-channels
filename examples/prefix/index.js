"use strict";

const { ServiceBroker } = require("moleculer");
const ChannelsMiddleware = require("../../").Middleware;

let c = 1;

// Create broker
const broker = new ServiceBroker({
	namespace: "abc",
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
				await broker.sendToChannel("test.prefix.topic", {
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
		"test.prefix.topic": {
			group: "mygroup",
			handler(msg) {
				this.logger.info("____________________");
				this.logger.info(msg);
				this.logger.info("____________________");
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
