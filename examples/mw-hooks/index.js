"use strict";

const { ServiceBroker } = require("moleculer");
const ChannelsMiddleware = require("../../").Middleware;
const kleur = require("kleur");

let c = 0;

const MyMiddleware = {
	name: "MyMiddleware",

	// Wrap the channel handlers
	localChannel(next, chan) {
		return async msg => {
			this.logger.info(kleur.magenta(`  Before localChannel for '${chan.name}'`), msg);
			await next(msg);
			this.logger.info(kleur.magenta(`  After localChannel for '${chan.name}'`), msg);
		};
	},

	// Wrap the `broker.sendToChannel` method
	sendToChannel(next) {
		return async (channelName, payload, opts) => {
			this.logger.info(kleur.yellow(`Before sendToChannel for '${channelName}'`), payload);
			await next(channelName, payload, opts);
			this.logger.info(kleur.yellow(`After sendToChannel for '${channelName}'`), payload);
		};
	}
};

// Create broker
const broker = new ServiceBroker({
	middlewares: [
		ChannelsMiddleware({
			adapter: process.env.ADAPTER || "redis://localhost:6379"
		}),
		MyMiddleware
	],
	replCommands: [
		{
			command: "publish",
			alias: ["p"],
			async action(broker, args) {
				const { options } = args;
				//console.log(options);
				await broker.sendToChannel("my.first.topic", {
					name: "Jane Doe",
					count: ++c,
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
			this.logger.info(kleur.cyan("    Message received in handler"), msg);
		}
	}
});

broker
	.start()
	.then(async () => {
		broker.repl();

		await Promise.delay(1000);
		broker.logger.info("Sending...");
		await broker.sendToChannel("my.first.topic", {
			name: "John",
			count: c,
			pid: process.pid
		});
	})
	.catch(err => {
		broker.logger.error(err);
		broker.stop();
	});
