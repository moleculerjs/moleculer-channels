import { ServiceBroker, Context, ServiceSchema, ServiceSettingSchema } from "moleculer";
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

interface LocalMethods {
	foo(payload: object): Promise<string>;
}

broker.createService({
	name: "test",
	channels: {
		"test": {
			context: true,
			deadLettering: {
				enabled: true,
				queueName: "dead-letter-queue"
			},
			async handler(ctx: Context) {
				// Process the incoming message
				console.log("Received message:", ctx.params);
				await this.foo(ctx);
				return "Message processed";
			}
		},
		test2(payload: object) {
			// Process the incoming message
			console.log("Received message:", payload);
			return this.foo(payload);
		}
	},
	methods: {
		foo(payload: object): Promise<string> {
			return Promise.resolve("Hello from foo");
		}
	}
} as ServiceSchema<ServiceSettingSchema, LocalMethods>);

async function start() {
	await broker.start();

	await broker.sendToChannel("test", { foo: "bar" });
	await broker.sendToChannel("test2", { baz: "qux" });
};

start();
