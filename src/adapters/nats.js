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
 * @typedef {import("nats").JetStreamManager} NatsJetStreamManager NATS Jet Stream Manager
 * @typedef {import("nats").JetStreamClient} NatsJetStreamClient NATS JetStream Client
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

		/** @type {NatsJetStreamManager} */
		this.manager = null;
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

		/** @type {NatsJetStreamManager} */
		this.manager = await this.connection.jetstreamManager();

		// await this.manager.streams.add({ name: "a", subjects: ["a.*"] });

		// const client = await this.createNATSClient("t", this.opts.nats);
	}

	/**
	 *
	 * @param {name} name
	 * @param {any} opts
	 *
	 * @memberof NatsAdapter
	 * @returns {NatsJetStreamClient}
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
	 * @param {Object?} opts
	 */
	async publish(channelName, payload, opts = {}) {
		this.logger.info(`${channelName} -- NATS out =>`);
	}
}

module.exports = NatsAdapter;
