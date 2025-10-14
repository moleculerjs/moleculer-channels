"use strict";

const { ServiceBroker } = require("moleculer");
const ChannelsMiddleware = require("../../").Middleware;

let c = 1;

// Create broker
const broker = new ServiceBroker({
	namespace: "uat",
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
				await broker.sendToChannel(
					"my.first.topic",
					{
						id: 2,
						name: "Jane Doe",
						status: false,
						count: ++c,
						pid: process.pid
					},
					{ key: "" + c, headers: { a: "something" }, xaddMaxLen: "~10" }
				);
			}
		}
	]
});

broker.createService({
	name: "users",
	channels: {
		async "my.first.topic"(msg) {
			this.logger.info("[USERS] Channel One msg received", msg);
		}
	},
	async started() {
		this.logger.info("Service started. Sending message to channel...");
		await this.broker.sendToChannel(
			"my.first.topic",
			{
				id: 1,
				name: "John Doe",
				status: true,
				count: ++c,
				pid: process.pid
			},
			{ key: "" + c, headers: { a: "something" }, xaddMaxLen: "~10" }
		);
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
