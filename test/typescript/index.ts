import { ServiceBroker, Context, Service as MoleculerService, ServiceSchema } from "moleculer";
import { Middleware as ChannelsMiddleware } from "@moleculer/channels";

const broker = new ServiceBroker({
	middlewares: [
		ChannelsMiddleware({
			adapter: {
				type: "Fake",
				options: {

				}
			}
		})
	]
});

broker.createService({
	name: "test",
	channels: {
		"test": {
			context: true,
			deadLettering: {
				enabled: true,
				queueName: "dead-letter-queue"
			},
			handler: async (ctx) => {
				// Process the incoming message
				console.log("Received message:", ctx.params);
				return "Message processed";
			}
		}
	}
});

async function start() {
	await broker.start();
};

start();
