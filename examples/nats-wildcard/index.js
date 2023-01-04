const { ServiceBroker } = require("moleculer");
const ChannelsMiddleware = require("../..").Middleware;

async function main() {
	const broker = new ServiceBroker({
		nodeID: "channelTest",
		// logger: false,
		logLevel: "debug",
		middlewares: [
			ChannelsMiddleware({
				schemaProperty: "streamOne",
				adapterPropertyName: "streamOneAdapter",
				sendMethodName: "sendToStreamOneChannel",
				channelHandlerTrigger: "emitStreamOneLocalChannelHandler",
				adapter: {
					type: "NATS",
					options: {
						nats: {
							// url: process.env.NATS_SERVER,
							connectionOptions: {
								// debug: true
								// user: process.env.NATS_USER,
								// pass: process.env.NATS_PASSWORD
							},
							streamConfig: {
								name: "streamOne",
								subjects: ["streamOneTopic.*"]
							},
							consumerOptions: {
								config: {
									deliver_policy: "new",
									ack_policy: "explicit",
									max_ack_pending: 1
								}
							}
						},
						maxInFlight: 10,
						maxRetries: 3,
						deadLettering: {
							enabled: false,
							queueName: "DEAD_LETTER_REG"
						}
					}
				}
			})
		]
	});

	broker.createService({
		name: "sub",
		streamOne: {
			"streamOneTopic.>": {
				group: "other",
				nats: {
					consumerOptions: {
						config: {
							deliver_policy: "new"
						}
					},
					streamConfig: {
						name: "streamOne",
						subjects: ["streamOneTopic.>"]
					}
				},
				async handler(payload) {
					console.log(`Processing streamOneTopic: ${JSON.stringify(payload)}}`);
				}
			}
		}
	});

	await broker.start().delay(2000);

	const msg = {
		id: 1,
		name: "John",
		age: 25
	};
	await broker.sendToStreamOneChannel("streamOneTopic.abc", { ...msg, topic: "abc" });
	await broker.Promise.delay(200);
	await broker.sendToStreamOneChannel("streamOneTopic.abc.def", { ...msg, topic: "abc" });
	await broker.Promise.delay(200);
	await broker.sendToStreamOneChannel("streamOneTopic.xyz", { ...msg, topic: "xyz" });
	await broker.Promise.delay(200);
	broker.repl();
}

main().catch(err => console.error(err));
