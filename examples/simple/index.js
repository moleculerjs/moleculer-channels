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
				await broker.sendToChannel("my.first.topic", {
					id: 2,
					name: "Jane Doe",
					status: false,
					count: ++c,
					pid: process.pid
				});
			}
		},
		{
			command: "publish2",
			alias: ["p2"],
			async action(broker, args) {
				const { options } = args;
				//console.log(options);
				await broker.sendToChannel("my.second.topic", {
					id: 2,
					name: "Jane Doe",
					status: true,
					pid: process.pid
				});
			}
		}
	]
});

broker.createService({
	name: "posts",
	version: 1,
	channels: {
		async "my.first.topic"(msg) {
			this.logger.info("[POSTS] Channel One msg received", msg);
			/*if (Math.random() > 0.7) {
				this.logger.warn("Throwing some error...");
				throw new Error("Something happened");
			}*/
		},

		"my.second.topic": {
			group: "other",
			// maxInFlight: 1,
			async handler(msg) {
				this.logger.info("[POSTS] Channel Two msg received", msg);
			}
		}
	}
});

broker.createService({
	name: "users",
	channels: {
		async "my.first.topic"(msg) {
			this.logger.info("[USERS] Channel One msg received", msg);
		},

		"my.second.topic": {
			group: "other",
			// maxInFlight: 1,
			async handler(msg) {
				this.logger.info("[USERS] Channel Two msg received", msg);
			}
		}
	}
});

broker
	.start()
	.then(async () => {
		broker.repl();

		//await Promise.delay(1000);
		console.log("Publish 'my.first.topic' message...");
		await broker.sendToChannel("my.first.topic", {
			id: 1,
			name: "John Doe",
			status: true,
			count: c,
			pid: process.pid
		});

		await Promise.delay(5000);
		console.log("Publish 'my.second.topic' message...");
		await broker.sendToChannel("my.second.topic", { id: 2, name: "Jane Doe", status: true });

		/*setInterval(() => {
			c++;
			console.log("Publish 'my.first.topic' message...", c);
			broker.sendToChannel("my.first.topic", {
				id: 1,
				name: "John Doe",
				status: true,
				count: c,
				pid: process.pid
			});
		}, 2000);*/
	})
	.catch(err => {
		broker.logger.error(err);
		broker.stop();
	});
