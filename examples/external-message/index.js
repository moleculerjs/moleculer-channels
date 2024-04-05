"use strict";

// Based on the example from: https://github.com/moleculerjs/moleculer-channels/issues/76

const { ServiceBroker } = require("moleculer");
const ChannelsMiddleware = require("../..").Middleware;
const { jetstream } = require("nats");
const { connect } = require("nats");

let counter = 1;

// pointer to the NATS connection
let nc = null;

const broker = new ServiceBroker({
	namespace: "uat",
	logLevel: {
		CHANNELS: "debug",
		"**": "info"
	},
	middlewares: [
		ChannelsMiddleware({
			adapter: "NATS"
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
						count: ++counter,
						pid: process.pid
					},
					{ key: "" + counter, headers: { a: "something" } }
				);
			}
		},
		{
			command: "natsJSON",
			alias: ["nj"],
			async action(broker, args) {
				const { options } = args;
				//console.log(options);
				try {
					nc.publish(
						"uat.my.first.topic",
						JSON.stringify({
							id: 2,
							name: "Jane Doe",
							status: false,
							count: ++counter,
							pid: process.pid
						})
					);
				} catch (error) {
					console.error(error);
				}
			}
		},
		{
			command: "natsString",
			alias: ["ns"],
			async action(broker, args) {
				const { options } = args;
				//console.log(options);
				try {
					nc.publish("uat.my.first.topic", "Hello World");
				} catch (error) {
					console.error(error);
				}
			}
		}
	],
	async started() {
		try {
			nc = await connect({ servers: "nats://localhost:4222" });
		} catch (error) {
			console.error(error);
		}
	},
	async stopped() {
		if (nc) {
			try {
				await nc.close();
			} catch (error) {
				console.error(error);
			}
		}
	}
});

broker.createService({
	name: "posts",
	version: 1,
	channels: {
		async "my.first.topic"(msg, raw) {
			this.logger.info("[POSTS] Channel One msg received", msg, raw.headers);
		}
	}
});

broker.start().then(async () => {
	broker.repl();
});
