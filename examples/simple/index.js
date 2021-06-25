"use strict";

const { ServiceBroker } = require("moleculer");
const ChannelsMiddleware = require("../../");

// Create broker
const broker = new ServiceBroker({
	middlewares: [ChannelsMiddleware()]
});

broker.start().then(async () => {
	broker.repl();
});
