"use strict";

const { ServiceBroker } = require("moleculer");
const ChannelsMiddleware = require("../../").Middleware;

let c = 0;

// --- BROKER 1 ---
const broker1 = new ServiceBroker({
	nodeID: "node-1",
	logLevel: {
		CHANNELS: "debug",
		"**": "info"
	},
	middlewares: [
		ChannelsMiddleware({
			adapter: {
				type: "Redis",
				options: {
					cluster: {
						nodes: [
							{ host: "127.0.0.1", port: 6381 }
							//{ host: "127.0.0.1", port: 6382 },
							//{ host: "127.0.0.1", port: 6383 }
						]
					}
				}
			}
		})
	],
	replCommands: [
		{
			command: "pub",
			alias: ["p"],
			async action(broker, args) {
				const { options } = args;
				//console.log(options);
				await broker.sendToChannel("test.redisCluster", {
					id: ++c,
					pid: process.pid
				});
			}
		}
	]
});

// --- BROKER 2 ---
const broker2 = new ServiceBroker({
	nodeID: "node-2",
	logLevel: {
		CHANNELS: "debug",
		"**": "info"
	},
	middlewares: [
		ChannelsMiddleware({
			adapter: {
				type: "Redis",
				options: {
					cluster: {
						nodes: [
							//{ host: "127.0.0.1", port: 6381 },
							{ host: "127.0.0.1", port: 6382 }
							//{ host: "127.0.0.1", port: 6383 }
						]
					}
				}
			}
		})
	]
});

broker2.createService({
	name: "sub1",
	channels: {
		"test.redisCluster": {
			handler(payload) {
				this.logger.info(`Received message on ${broker2.nodeID}`, payload);
			}
		}
	}
});

// --- BROKER 3 ---
const broker3 = new ServiceBroker({
	nodeID: "node-3",
	logLevel: {
		CHANNELS: "debug",
		"**": "info"
	},
	middlewares: [
		ChannelsMiddleware({
			adapter: {
				type: "Redis",
				options: {
					cluster: {
						nodes: [
							//{ host: "127.0.0.1", port: 6381 },
							//{ host: "127.0.0.1", port: 6382 },
							{ host: "127.0.0.1", port: 6383 }
						]
					}
				}
			}
		})
	]
});

broker3.createService({
	name: "sub2",
	channels: {
		"test.redisCluster": {
			handler(payload) {
				this.logger.info(`Received message on ${broker3.nodeID}`, payload);
			}
		}
	}
});

Promise.all([broker1.start(), broker2.start(), broker3.start()])
	.then(() => broker1.repl())
	.catch(async err => broker1.logger.error(err));
