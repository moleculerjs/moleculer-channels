"use strict";

const { ServiceBroker } = require("moleculer");
const ChannelsMiddleware = require("../../").Middleware;

let c = 1;

// Create broker
const broker = new ServiceBroker({
	logLevel: {
		//CHANNELS: "debug",
		"**": "info"
	},
	metrics: {
		enabled: true,
		reporter: {
			type: "Console",
			options: {
				includes: ["moleculer.channels.**"]
			}
		}
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
					{ key: "" + c, headers: { a: "something" } }
				);
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
		async "my.first.topic"(msg, raw) {
			this.logger.info("[POSTS] Channel One msg received", msg, raw.key, raw.headers);
			await this.Promise.delay(300 + Math.random() * 500);
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
				await this.Promise.delay(50 + Math.random() * 200);
			}
		}
	}
});

broker
	.start()
	.then(async () => {
		broker.repl();

		setInterval(() => {
			c++;
			console.log("Publish 'my.first.topic' message...", c);
			broker.sendToChannel("my.first.topic", {
				id: 1,
				name: "John Doe",
				status: true,
				count: c,
				pid: process.pid
			});
		}, 2000);
	})
	.catch(err => {
		broker.logger.error(err);
		broker.stop();
	});
