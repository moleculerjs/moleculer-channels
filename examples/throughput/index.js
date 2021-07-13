"use strict";

const { ServiceBroker } = require("moleculer");
const ChannelsMiddleware = require("../../").Middleware;

// Create broker
const broker = new ServiceBroker({
	logLevel: "warn",
	middlewares: [
		ChannelsMiddleware({
			adapter: process.env.ADAPTER || "redis://localhost:6379"
		})
	]
});

const MAX = 10 * 1000;
let startTime;
let count = 0;

broker.createService({
	name: "posts",
	channels: {
		"my.topic"() {
			count++;
			if (count == MAX) {
				const diff = process.hrtime(startTime);
				console.log(`${count} messages processed in ${diff[0]}s ${diff[1] / 1000000}ms`);
				const ms = diff[0] / 1000 + diff[1] / 1000000;
				const thr = MAX / ms;
				console.log(
					`Throughput: ${thr.toLocaleString("hu-HU", {
						maximumFractionDigits: 0
					})} msg/sec`
				);
				broker.stop();
			}
		}
	}
});

broker
	.start()
	.then(() => {
		setTimeout(() => {
			startTime = process.hrtime();

			console.log(`Start publish ${MAX} messages...`);
			for (let i = 0; i < MAX; i++) {
				broker.sendToChannel("my.topic", { count: i });
			}
			console.log(`Waiting for consumers...`);
		}, 1000);
	})
	.catch(err => {
		broker.logger.error(err);
		broker.stop();
	});
