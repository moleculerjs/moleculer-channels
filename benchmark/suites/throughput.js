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
	{ type: "AMQP", options: {} }
];

Promise.mapSeries(Adapters, async adapterDef => {
	const adapterName = adapterDef.name || adapterDef.type;
	console.log(kleur.yellow().bold(`Start benchmark... Adapter: ${adapterName}`));

	const broker = new ServiceBroker({
		namespace: `bench-${adapterName}`,
		logLevel: "warn",
		middlewares: [
			ChannelsMiddleware({
				adapter: _.defaultsDeep({ options: { maxInFlight: 10 } }, adapterDef)
			})
		]
	});
	const MAX = 10 * 1000;
	let startTime;
	let done;
	let count = 0;

	broker.createService({
		name: "consumer",
		channels: {
			"bench.topic": {
				handler() {
					count++;
					if (count == MAX) {
						const diff = process.hrtime(startTime);
						const ms = diff[0] * 1e3 + diff[1] * 1e-6;
						console.log(`    ${count} messages processed in ${humanize(ms)}`);
						const sec = diff[0] + diff[1] / 1e9;
						const thr = MAX / sec;
						console.log(kleur.yellow().bold("------------------"));
						console.log(
							kleur.yellow().bold(
								`Throughput: ${thr.toLocaleString("hu-HU", {
									maximumFractionDigits: 0
								})} msg/sec`
							)
						);
						console.log("");
						adapterDef.thr = thr;
						done();
					}
				}
			}
		}
	});

	await broker.start();

	await new Promise(resolve => {
		setTimeout(async () => {
			startTime = process.hrtime();
			done = resolve;

			console.log(`    Start publish ${MAX} messages...`);
			for (let i = 0; i < MAX; i++) {
				try {
					await broker.sendToChannel("bench.topic", { count: i });
				} catch (err) {
					if (err.message.endsWith("is full.")) {
						console.debug("    Buffer is full. Wait...");
						await Promise.delay(10);
					} else {
						console.error(
							`Unable to send at ${i} of ${MAX}. Received: ${count}`,
							err.message
						);
						process.exit(1);
					}
				}
			}
			console.log("    Waiting for consumers...");
		}, 1000);
	});

	await broker.stop();
});
