"use strict";

const _ = require("lodash");
const { ServiceBroker } = require("moleculer");
const ChannelsMiddleware = require("../..").Middleware;

let numMessages = 100;
let ids;
let sub1Counter = 0;
let sub2Counter = 0;
const maxRetries = 10;

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

				await broker.call("sub1.resetIDs");

				await Promise.all(
					_.times(numMessages, id => broker.sendToChannel("test.unstable.topic", { id }))
				);

				await broker.Promise.delay(1000);

				const { remainingIDs, sub1Calls, sub2Calls } = await broker.call("sub1.checkIDs");

				broker.logger.info(` ===>> Remaining IDs : ${remainingIDs} <<=== `);
				broker.logger.info(
					` ===>> Error Handler : ${sub1Calls} || Good Handler : ${sub2Calls} <<=== `
				);
			}
		}
	]
});

broker.createService({
	name: "sub1",
	actions: {
		resetIDs: {
			handler() {
				ids = new Set(Array.from(Array(numMessages).keys()));

				sub1Counter = 0;
				sub2Counter = 0;
			}
		},

		checkIDs: {
			handler() {
				return {
					remainingIDs: ids.size,
					sub1Calls: sub1Counter,
					sub2Calls: sub2Counter
				};
			}
		}
	},
	channels: {
		"test.unstable.topic": {
			group: "mygroup",
			maxRetries: maxRetries,
			handler(payload, raw) {
				sub1Counter++;
				this.logger.error(
					`Ups! Something happened messageID:${payload.id} || JS_SequenceID:${raw.seq}`
				);
				return Promise.reject(new Error("Something happened"));
			}
		}
	}
});

broker.createService({
	name: "sub2",
	channels: {
		"test.unstable.topic": {
			group: "mygroup",
			// Defaults to 1 hour. Decrease for unit tests
			minIdleTime: 10,
			claimInterval: 10,
			maxRetries: maxRetries,
			handler(msg) {
				sub2Counter++;

				ids.delete(msg.id);

				this.logger.info(msg);
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
