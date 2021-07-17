"use strict";

const { ServiceBroker } = require("moleculer");
const ChannelsMiddleware = require("../..").Middleware;

function createBrokerService(numbBrokers, numChannels) {
	let brokerList = [];

	for (let i = 0; i < numbBrokers; i++) {
		// Create broker
		let broker = new ServiceBroker({
			logLevel: {
				CHANNELS: "info",
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

						// Sample a topic
						let topicName = `topic.${
							globalTopicList[Math.floor(Math.random() * globalTopicList.length)]
						}`;

						await broker.sendToChannel(topicName, {
							id: 2,
							name: "Jane Doe",
							status: false,
							pid: process.pid
						});
					}
				}
			]
		});

		// Create service
		let serviceSchema = {
			name: `service.${String(i)}`,

			channels: {}
		};

		const topicList = Array.from(Array(numTopics).keys()).map(entry => String(entry));

		// Add channels to the service
		for (let j = 0; j < numChannels; j++) {
			// Pick a topic
			let idx = Math.floor(Math.random() * topicList.length);
			let topicName = `topic.${topicList.splice(idx, 1)[0]}`;

			serviceSchema.channels[`${topicName}`] = {
				async handler(msg) {
					this.logger.info(
						`[${serviceSchema.name}] Channel '${topicName}' received msg`,
						msg
					);
				}
			};
		}

		broker.createService(serviceSchema);
		brokerList.push(broker);
	}

	return brokerList;
}

const numTopics = 100;
const numBrokers = 100;
const numChannelPerService = 5;

const globalTopicList = Array.from(Array(numTopics).keys()).map(entry => String(entry));

const brokerList = createBrokerService(numBrokers, numChannelPerService);

Promise.all(brokerList.map(broker => broker.start()))
	.then(() => {
		brokerList[0].logger.info(
			`Started ${brokerList.length} brokers and ${
				brokerList.length * (numChannelPerService + 1)
			} Redis Connections`
		);
		brokerList[0].repl();
	})
	.catch(err => {
		brokerList[0].logger.error(err);

		brokerList.map(broker => broker.stop());
	});
