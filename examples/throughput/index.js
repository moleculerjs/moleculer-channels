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
		"my.topic": {
			maxInFlight: 10,
			handler(msg) {
				count++;
				if (count == MAX) {
					const diff = process.hrtime(startTime);
					console.log(
						`${count} messages processed in ${diff[0]}s ${diff[1] / 1000000}ms`
					);
					const sec = diff[0] + diff[1] / 1e9;
					const thr = MAX / sec;
					console.log(
						`Throughput: ${thr.toLocaleString("hu-HU", {
							maximumFractionDigits: 0
						})} msg/sec`
					);
					console.log("Stop broker");
					broker.stop();
				}
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
