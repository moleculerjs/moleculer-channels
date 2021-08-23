const _ = require("lodash");
const { ServiceBroker } = require("moleculer");
const ChannelsMiddleware = require("../../").Middleware;

let FLOW = [];
let id = 0;

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
			command: "pub0",
			alias: ["p0"],
			async action(broker, args) {
				const { options } = args;
				//console.log(options);
				await Promise.all(
					_.times(5, i => broker.sendToChannel("test.mif.topic", { id: i }))
				);
			}
		},
		{
			command: "pub1",
			alias: ["p1"],
			async action(broker, args) {
				const { options } = args;
				//console.log(options);
				await broker.sendToChannel("test.mif.topic", {
					id: id++,
					name: "test.mif.topic",
					pid: process.pid
				});
			}
		},
		{
			command: "pub2",
			alias: ["p2"],
			async action(broker, args) {
				console.log(FLOW);

				FLOW = [];
				id = 0;
			}
		}
	]
});

broker.createService({
	name: "sub1",
	channels: {
		"test.mif.topic": {
			maxInFlight: 1,
			async handler(payload) {
				const consumerID = Array.from(this.broker.channelAdapter.activeMessages.keys())[0];

				console.log(
					`----> Processing ${
						payload.id
					} || Active messages ${this.broker.channelAdapter.getNumberOfChannelActiveMessages(
						consumerID
					)} <----`
				);

				FLOW.push(`BEGIN: ${payload.id}`);
				await this.Promise.delay(300);
				FLOW.push(`END: ${payload.id}`);
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
