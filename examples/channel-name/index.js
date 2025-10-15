"use strict";

const { ServiceBroker } = require("moleculer");
const ChannelsMiddleware = require("../..").Middleware;
const TracingMiddleware = require("../..").Tracing;

let c = 1;

// Create broker
const broker = new ServiceBroker({
	logLevel: {
		CHANNELS: "info",
		"**": "info"
	},
	middlewares: [
		ChannelsMiddleware({
			// adapter: {
			// 	type: "Fake"
			// },
			/*adapter: {
				type: "Kafka",
				options: { kafka: { brokers: ["localhost:9093"] } }
			},*/
			/*adapter: {
				type: "AMQP"
			},*/
			adapter: {
				type: "NATS"
			},
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
		}),
		TracingMiddleware()
	],
	replCommands: [
		// {
		// 	command: "publish",
		// 	alias: ["p"],
		// 	async action(broker, args) {
		// 		const payload = {
		// 			id: ++c,
		// 			name: "Jane Doe",
		// 			pid: process.pid
		// 		};
		// 		await broker.call(
		// 			"publisher.publish",
		// 			{ payload, headers: { a: "123" } },
		// 			{
		// 				meta: {
		// 					loggedInUser: {
		// 						id: 12345,
		// 						name: "John Doe",
		// 						roles: ["admin"],
		// 						status: true
		// 					}
		// 				}
		// 			}
		// 		);
		// 	}
		// }
	]
});

broker.createService({
	name: "publisher",
	actions: {
		async publish(ctx) {
			const parentChannelName = ctx.parentChannelName;
			const level = ctx.level;
			const caller = ctx.caller;
			const msg = `Flow level: ${level}, Type: Action, Name: 'publisher', Caller: ${caller}, Channel name: ${parentChannelName}`;
			this.logger.info(msg);

			await broker.sendToChannel("my.topic.level.2", ctx.params.payload, {
				ctx,
				headers: ctx.params.headers
			});

			await broker.Promise.delay(1000);
		}
	}
});

broker.createService({
	name: "sub2",
	channels: {
		"my.topic.level.2": {
			async handler(ctx, raw) {
				const parentChannelName = ctx.parentChannelName;
				const level = ctx.level;
				const caller = ctx.caller;
				const msg = `Flow level: ${level}, Type: Channel, Name: 'my.topic.level.2', Caller: ${caller}, Channel name: ${parentChannelName}`;
				this.logger.info(msg);

				await Promise.delay(100);

				const headers = this.broker.channelAdapter.parseMessageHeaders(raw);

				await broker.sendToChannel("my.topic.level.3", ctx.params, {
					ctx,
					headers
				});
			}
		}
	}
});

broker.createService({
	name: "sub3",
	channels: {
		"my.topic.level.3": {
			async handler(ctx, raw) {
				const parentChannelName = ctx.parentChannelName;
				const level = ctx.level;
				const caller = ctx.caller;
				const msg = `Flow level: ${level}, Type: Channel, Name: 'my.topic.level.3', Caller: ${caller}, Channel name: ${parentChannelName}`;
				this.logger.info(msg);

				await Promise.delay(100);

				const headers = this.broker.channelAdapter.parseMessageHeaders(raw);

				await broker.sendToChannel("my.topic.level.4", ctx.params, {
					ctx,
					headers
				});
			}
		}
	}
});

broker.createService({
	name: "sub4",
	channels: {
		"my.topic.level.4": {
			async handler(ctx, raw) {
				const parentChannelName = ctx.parentChannelName;
				const level = ctx.level;
				const caller = ctx.caller;
				const msg = `Flow level: ${level}, Type: Channel, Name: 'my.topic.level.4', Caller: ${caller}, Channel name: ${parentChannelName}`;
				this.logger.info(msg);

				await Promise.delay(100);

				await ctx.call("test.demo.level.5", null, { parentCtx: ctx });
			}
		}
	}
});

broker.createService({
	name: "test",
	actions: {
		"demo.level.5": {
			async handler(ctx) {
				const channelName = ctx?.options?.parentCtx?.currentChannelName;
				const level = ctx.level;
				const caller = ctx.caller;
				const msg = `Flow level: ${level}, Type: Action, Name: 'demo.level.5', Caller: ${caller}, Channel name: ${channelName}`;
				this.logger.info(msg);
				// this.logger.info("Demo service called", ctx);
			}
		}
	}
});

broker
	.start()
	.then(async () => {
		broker.repl();

		const payload = {
			id: ++c,
			name: "Jane Doe",
			pid: process.pid
		};

		broker.logger.info("Initializing the flow...");

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
	})
	.catch(err => {
		broker.logger.error(err);
		broker.stop();
	});
