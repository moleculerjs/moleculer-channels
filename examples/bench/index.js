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

let count = 0;
function doPublish() {
	count++;
	broker.sendToChannel("my.topic", { hello: "world" });
}

broker.createService({
	name: "posts",
	channels: {
		"my.topic"() {
			doPublish();
		}
	}
});

broker
	.start()
	.then(() => {
		setTimeout(() => {
			let startTime = Date.now();

			setInterval(() => {
				let rps = count / ((Date.now() - startTime) / 1000);
				console.log(rps.toLocaleString("hu-HU", { maximumFractionDigits: 0 }), "msg/s");
				count = 0;
				startTime = Date.now();
			}, 1000);

			console.log("Start bench...");
			broker.waitForServices(["posts"]).then(() => doPublish());
		}, 1000);
	})
	.catch(err => {
		broker.logger.error(err);
		broker.stop();
	});
