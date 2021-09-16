/*
 * @moleculer/channels
 * Copyright (c) 2021 MoleculerJS (https://github.com/moleculerjs/channels)
 * MIT Licensed
 */

"use strict";

const BaseAdapter = require("./base");
const _ = require("lodash");
const { MoleculerError } = require("moleculer").Errors;

let NATS;

/**
 * @typedef {import("nats").NatsConnection} NatsConnection NATS Connection
 * @typedef {import("nats").JetStreamManager} JetStreamManager NATS Jet Stream Manager
 * @typedef {import("nats").JetStreamClient} JetStreamClient NATS JetStream Client
 * @typedef {import("nats").JetStreamPublishOptions} JetStreamPublishOptions JetStream Publish Options
 * @typedef {import("nats").ConsumerOptsBuilder} ConsumerOptsBuilder NATS JetStream ConsumerOptsBuilder
 * @typedef {import("nats").ConsumerOpts} ConsumerOpts Jet Stream Consumer Opts
 * @typedef {import("moleculer").ServiceBroker} ServiceBroker Moleculer Service Broker instance
 * @typedef {import("moleculer").LoggerInstance} Logger Logger instance
 * @typedef {import("../index").Channel} Channel Base channel definition
 * @typedef {import("./base").BaseDefaultOptions} BaseDefaultOptions Base adapter options
 */

/**
 * NATS JetStream adapter
 *
 * More info: https://github.com/nats-io/nats.deno/blob/main/jetstream.md
 *
 * @class NatsAdapter
 * @extends {BaseAdapter}
 */
class NatsAdapter extends BaseAdapter {
	constructor(opts) {
		if (_.isString(opts)) opts = { nats: opts };

		super(opts);

		/** @type { BaseDefaultOptions } */
		this.opts = _.defaultsDeep(this.opts, {});

		/** @type {NatsConnection} */
		this.connection = null;

		/** @type {JetStreamManager} */
		this.manager = null;

		/**
		 * @type {Map<string,JetStreamClient>}
		 */
		this.clients = new Map();
		this.pubName = "Pub"; // Static name of the Publish client
	}

	/**
	 * Initialize the adapter.
	 *
	 * @param {ServiceBroker} broker
	 * @param {Logger} logger
	 */
	init(broker, logger) {
		super.init(broker, logger);

		try {
			NATS = require("nats");
		} catch (err) {
			/* istanbul ignore next */
			this.broker.fatal(
				"The 'nats' package is missing! Please install it with 'npm install nats --save' command.",
				err,
				true
			);
		}

		this.checkClientLibVersion("nats", "^2.2.0");
	}

	/**
	 * Connect to the adapter.
	 */
	async connect() {
		/** @type {NatsConnection} */
		this.connection = await NATS.connect();

		/** @type {JetStreamManager} */
		this.manager = await this.connection.jetstreamManager();

		this.clients.set(this.pubName, await this.createNATSClient(this.pubName, {}));
	}

	/**
	 *
	 * @param {name} name
	 * @param {any} opts
	 *
	 * @memberof NatsAdapter
	 * @returns {JetStreamClient}
	 */
	async createNATSClient(name, opts) {
		try {
			const client = await this.connection.jetstream(opts);
			this.logger.info(`NATS-Channel-Client-${name} adapter is connected.`);
			return client;
		} catch (error) {
			this.logger.error(`NATS-Channel-Client-${name} adapter error`, err.message);
		}
	}

	/**
	 * Disconnect from adapter
	 */
	async disconnect() {}

	/**
	 * Subscribe to a channel with a handler.
	 *
	 * @param {Channel} chan
	 */
	async subscribe(chan) {
		this.logger.info(`NATS --- ${chan.id} --- in <=`);

		// 1. Check if Stream already exists
		// NATS Stream name does not support: spaces, tabs, period (.), greater than (>) or asterisk (*) are prohibited.
		// More info: https://docs.nats.io/jetstream/administration/naming
		const streamName = chan.name.split(".").join("_");
		try {
			const streamInfo = await this.manager.streams.add({
				name: streamName,
				subjects: [chan.name]
			});
			this.logger.debug(streamInfo);
		} catch (error) {
			if (error.message === "stream name already in use") {
				// Silently ignore the error. Channel or Consumer Group already exists
				this.logger.debug(`NATS Stream with name: '${streamName}' already exists.`);
			} else {
				this.logger.error(error.message);
			}
		}

		// 2. Create Client for current consumer
		const chanSub = await this.createNATSClient(this.pubName, {});
		this.clients.set(this.pubName, chanSub);

		// 3. Configure NATS consumer
		/** @type {ConsumerOptsBuilder | ConsumerOpts} */
		const consumerOpts = NATS.consumerOpts();
		consumerOpts.queue(streamName);
		consumerOpts.durable(chan.name.split(".").join("_"));
		consumerOpts.deliverTo(chan.id);
		consumerOpts.callback((err, message) => {
			if (err) {
				this.logger.error(err);
				return;
			}

			if (message) {
				chan.handler(this.serializer.deserialize(message.data), message);
			}

			message.ack();
		});

		// console.log(consumerOpts);

		try {
			await chanSub.subscribe(chan.name, consumerOpts);
		} catch (error) {
			this.logger.error(`An error ocurred when subscribing to a ${chan.name}`, error);
		}
	}

	/**
	 * Unsubscribe from a channel.
	 *
	 * @param {Channel} chan
	 */
	async unsubscribe(chan) {}

	/**
	 * Publish a payload to a channel.
	 *
	 * @param {String} channelName
	 * @param {any} payload
	 * @param {Partial<JetStreamPublishOptions>?} opts
	 */
	async publish(channelName, payload, opts = {}) {
		this.logger.info(`${channelName} -- NATS out =>`);

		const clientPub = this.clients.get(this.pubName);

		try {
			const response = await clientPub.publish(
				channelName,
				this.serializer.serialize(payload),
				opts
			);

			this.logger.info(response);
		} catch (error) {
			this.logger.error(`An error ocurred while publishing message to ${channelName}`, error);
		}
	}
}

module.exports = NatsAdapter;
