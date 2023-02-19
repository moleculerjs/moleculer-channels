"use strict";

const { ServiceBroker } = require("moleculer");
const ChannelsMiddleware = require("../..").Middleware;

let c = 1;

// Create broker
const broker = new ServiceBroker({
	logLevel: {
		CHANNELS: "debug",
		"**": "info"
	},
	tracing: {
		enabled: true,
		exporter: {
			type: "Console"
		}
	},
	middlewares: [
		ChannelsMiddleware({
			adapter: {
				type: "Fake"
			},
			/*adapter: {
				type: "Kafka",
				options: { kafka: { brokers: ["localhost:9093"] } }
			},*/
			/*adapter: {
				type: "AMQP"
			},*/
			/*adapter: {
				type: "NATS"
			},*/
			/*
			adapter: {
				type: "Redis",
				options: {
					redis: "localhost:6379"
					//serializer: "MsgPack"
				}
			},
			*/
			context: true
		})
	],
	replCommands: [
		{
			command: "publish",
			alias: ["p"],
			async action(broker, args) {
				const payload = {
					id: ++c,
					name: "Jane Doe",
					pid: process.pid
				};

				await broker.call(
					"publisher.publish",
					{ payload, headers: { a: "123" } },
					{
						meta: {
							loggedInUser: {
								id: 12345,
								name: "John Doe",
								roles: ["admin"],
								status: true
							}
						}
					}
				);
			}
		}
	]
});

broker.createService({
	name: "publisher",
	actions: {
		async publish(ctx) {
			await broker.sendToChannel("my.topic", ctx.params.payload, {
				ctx,
				headers: ctx.params.headers
			});

			await broker.Promise.delay(1000);
		}
	}
});

broker.createService({
	name: "sub1",
	channels: {
		"my.topic": {
			//context: true,
			async handler(ctx, raw) {
				this.logger.info("Processing...", ctx);

				await Promise.delay(100);

				this.logger.info("Processed!", ctx.params, ctx.meta);
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
