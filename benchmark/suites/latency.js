"use strict";

//const Benchmarkify = require("benchmarkify");
const _ = require("lodash");
const kleur = require("kleur");
const { ServiceBroker } = require("moleculer");
const { polyfillPromise, humanize } = require("moleculer").Utils;
const ChannelsMiddleware = require("../..").Middleware;
//const { writeResult } = require("../utils");
//const { generateMarkdown } = require("../generate-result");
polyfillPromise(Promise);

const Adapters = [
	{ type: "Redis", options: {} },
	{
		type: "Redis",
		name: "RedisCluster",
		options: {
			cluster: {
				nodes: [
					{ host: "127.0.0.1", port: 6381 },
					{ host: "127.0.0.1", port: 6382 },
					{ host: "127.0.0.1", port: 6383 }
				]
			}
		}
	},
	{ type: "AMQP", options: {} },
	{ type: "NATS", options: {} },
	{ type: "Kafka", options: { kafka: { brokers: ["localhost:9093"] } } }
];

Promise.mapSeries(Adapters, async adapterDef => {
	const adapterName = adapterDef.name || adapterDef.type;
	console.log(kleur.yellow().bold(`Start benchmark... Adapter: ${adapterName}`));

	const broker = new ServiceBroker({
		namespace: `bench-${adapterName}`,
		logLevel: "warn",
		middlewares: [ChannelsMiddleware({ adapter: adapterDef })]
	});

	let count = 0;
	function doPublish() {
		count++;
		broker.sendToChannel("bench.topic", { c: count });
	}

	broker.createService({
		name: "consumer",
		channels: {
			"bench.topic": {
				handler() {
					doPublish();
				}
			}
		}
	});

	await broker.start();

	let cycle = 0;
	const cycleRps = [];
	await new Promise(resolve => {
		setTimeout(() => {
			let startTime = Date.now();

			let timer = setInterval(() => {
				const rps = count / ((Date.now() - startTime) / 1000);
				cycleRps.push(rps);
				console.log(
					"   ",
					rps.toLocaleString("hu-HU", { maximumFractionDigits: 0 }),
					"msg/s"
				);
				count = 0;
				startTime = Date.now();
				cycle++;
				if (cycle >= 10) {
					clearInterval(timer);
					resolve();
				}
			}, 1000);

			broker.waitForServices(["consumer"]).then(() => doPublish());
		}, 1000);
	});

	const avg = _.mean(cycleRps);
	console.log(kleur.magenta().bold("------------------"));
	console.log(
		kleur
			.magenta()
			.bold(`Average: ${avg.toLocaleString("hu-HU", { maximumFractionDigits: 0 })} msg/s`)
	);
	console.log("");
	console.log(kleur.magenta().bold(`Latency: ${humanize(1000 / avg)}`));
	console.log("");
	adapterDef.avg = avg;

	await broker.stop();
});
