"use strict";

const { ServiceBroker } = require("moleculer");
const ChannelsMiddleware = require("../../").Middleware;

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
					url: "localhost:4222",
					amqp: {
						url: "amqp://localhost:5672"
					},
					redis: "localhost:6379"
					//serializer: "MsgPack"
				}
			}
		})
	],
	replCommands: [
		{
			command: "publish",
			alias: ["p"],
			async action(broker, args) {
				await broker.sendToChannel(
					"my.first.topic",
					{
						id: 2,
						name: "Jane Doe",
						status: false,
						count: ++c,
						pid: process.pid
					},
					{ key: "" + c, headers: { a: "something" } }
				);
			}
		}
	]
});

broker.createService({
	name: "posts",
	version: 1,
	channels: {
		async "my.first.topic"(msg, raw) {
			this.logger.info("[POSTS] Channel One msg received", msg);
		}
	}
});

broker
	.start()
	.then(async () => {
		broker.repl();

		console.log("Publish 'my.first.topic' message...");
		await broker.sendToChannel("my.first.topic", {
			id: 1,
			name: "John Doe",
			status: true,
			count: c,
			pid: process.pid
		});
	})
	.catch(err => {
		broker.logger.error(err);
		broker.stop();
	});
