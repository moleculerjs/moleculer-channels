"use strict";

const { ServiceBroker } = require("moleculer");
const ChannelsMiddleware = require("../../").Middleware;

// Create broker
const broker = new ServiceBroker({
	logLevel: {
		CHANNELS: "debug",
		"**": "info"
	},
	middlewares: [
		ChannelsMiddleware({
			adapter: process.env.ADAPTER || "redis://localhost:6379",
			schemaProperty: "redisChannel",
			sendMethodName: "sendToRedisChannel",
			adapterPropertyName: "redisAdapter"
		}),
		ChannelsMiddleware({
			adapter: process.env.ADAPTER || "redis://localhost:6379",
			schemaProperty: "redisAnother",
			sendMethodName: "sendToAnotherRedisChannel",
			adapterPropertyName: "anotherRedisAdapter"
		})
	],
	replCommands: [
		{},
		{
			command: "pub1",
			alias: ["p1"],
			async action(broker, args) {
				const { options } = args;
				//console.log(options);
				await broker.sendToRedisChannel("test.redisChannel", {
					name: "redisChannel",
					pid: process.pid
				});
			}
		},
		{
			command: "pub2",
			alias: ["p2"],
			async action(broker, args) {
				const { options } = args;
				//console.log(options);
				await broker.sendToAnotherRedisChannel("test.redisAnother", {
					name: "redisAnother",
					pid: process.pid
				});
			}
		}
	]
});

broker.createService({
	name: "sub1",
	redisChannel: {
		"test.redisChannel": {
			group: "mygroup",
			handler() {
				this.logger.info("redisChannel");
			}
		}
	},
	redisAnother: {
		"test.redisAnother": {
			group: "mygroup",
			handler() {
				this.logger.info("redisAnother");
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
