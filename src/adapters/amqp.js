/*
 * @moleculer/channels
 * Copyright (c) 2021 MoleculerJS (https://github.com/moleculerjs/channels)
 * MIT Licensed
 */

"use strict";

const BaseAdapter = require("./base");
const _ = require("lodash");
const { Serializers } = require("moleculer");
const { MoleculerError } = require("moleculer").Errors;

let Amqplib;

/**
 * Type defs to add some IntelliSense
 * @typedef {import("moleculer").ServiceBroker} ServiceBroker
 * @typedef {import("moleculer").LoggerInstance} Logger
 */

/**
 * AMQP adapter for RabbitMQ
 *
 * @class AmqpAdapter
 * @extends {BaseAdapter}
 */
class AmqpAdapter extends BaseAdapter {
	/**
	 * Constructor of adapter
	 * @param  {Object?} opts
	 */
	constructor(opts) {
		if (_.isString(opts)) {
			opts = {
				amqp: {
					url: opts
				}
			};
		}

		super(opts);

		this.opts.amqp = _.defaultsDeep(this.opts.amqp, {
			prefetch: 1,
			socketOptions: {},
			queueOptions: {},
			exchangeOptions: {},
			messageOptions: {},
			consumeOptions: {}
		});

		if (typeof this.opts.amqp.url == "string") {
			this.opts.amqp.url = this.opts.amqp.url
				.split(";")
				.filter(s => !!s)
				.map(s => s.trim());
		}

		this.connection = null;
		this.channel = null;

		this.connected = false;
		this.stopping = false;
		this.connectAttempt = 0;
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
			Amqplib = require("amqplib");
		} catch (err) {
			/* istanbul ignore next */
			this.broker.fatal(
				"The 'amqplib' package is missing! Please install it with 'npm install amqplib --save' command.",
				err,
				true
			);
		}

		this.checkClientLibVersion("amqplib", "^0.8.0");

		// create an instance of serializer (default to JSON)
		this.serializer = Serializers.resolve(this.opts.serializer);
		this.serializer.init(this.broker);
		this.logger.info("Channel serializer:", this.broker.getConstructorName(this.serializer));
	}

	/**
	 * Connect to the adapter.
	 */
	async connect() {
		this.logger.info("Creating AMQP connection...");

		let uri = this.opts.amqp.url;
		if (Array.isArray(uri)) {
			this.connectAttempt = (this.connectAttempt || 0) + 1;
			const urlIndex = (this.connectAttempt - 1) % uri.length;
			uri = uri[urlIndex];
		}

		this.logger.debug("Connecting to AMQP server...", uri);
		this.connection = await Amqplib.connect(uri, this.opts.amqp.socketOptions);
		this.connected = true;

		this.connection
			.on("error", err => {
				// No need to reject here since close event will be fired after
				// if not connected at all connection promise will be rejected
				this.logger.error("AMQP connection error.", err);
			})
			.on("close", err => {
				this.connected = false;
				if (!this.stopping) {
					this.logger.error("AMQP connection is closed.", err);
				} else {
					this.logger.info("AMQP connection is closed gracefully.");
				}
			})
			.on("blocked", reason => {
				this.logger.warn("AMQP connection is blocked.", reason);
			})
			.on("unblocked", () => {
				this.logger.info("AMQP connection is unblocked.");
			});
		this.logger.info("AMQP is connected.");

		this.logger.info(`Creating AMQP channel...`);
		this.channel = await this.connection.createChannel();
		this.channel
			.on("close", () => {
				this.logger.error("AMQP channel closed.");
			})
			.on("error", err => {
				this.logger.error("AMQP channel error", err);
			})
			.on("drain", () => {
				this.logger.info("AMQP channel is drained.");
			})
			.on("return", msg => {
				this.logger.warn("AMQP channel returned a message.", msg);
			});

		if (this.opts.amqp.prefetch != null) {
			this.channel.prefetch(this.opts.amqp.prefetch);
		}
	}

	/**
	 * Disconnect from adapter
	 */
	async disconnect() {
		this.stopping = true;
		try {
			if (this.channel) {
				this.logger.info("Closing AMQP channel...");
				await this.channel.close();
				this.channel = null;
			}

			if (this.connection) {
				this.logger.info("Closing AMQP connection...");
				await this.connection.close();
				this.connection = null;
			}
		} catch (err) {
			this.logger.error("Error while closing AMQP connection.", err);
		}
	}

	/**
	 * Subscribe to a channel.
	 *
	 * @param {Channel} chan
	 */
	async subscribe(chan) {
		this.logger.debug(
			`Subscribing to '${chan.name}' chan with '${chan.group}' group...'`,
			chan.id
		);

		// More info: http://www.squaremobius.net/amqp.node/channel_api.html#channel_assertQueue
		const queueOptions = _.defaultsDeep(
			{},
			chan.amqp ? chan.amqp.queueOptions : {},
			this.opts.amqp.queueOptions
		);
		await this.channel.assertQueue(chan.name, queueOptions);

		// More info http://www.squaremobius.net/amqp.node/channel_api.html#channel_consume
		const consumeOptions = _.defaultsDeep(
			{},
			chan.amqp ? chan.amqp.consumeOptions : {},
			this.opts.amqp.consumeOptions,
			{ consumerTag: chan.id }
		);

		await this.channel.consume(chan.name, this.createConsumerHandler(chan), consumeOptions);
	}

	/**
	 * Create a handler for the consumer.
	 * @param {Channel} chan
	 * @returns {Function}
	 */
	createConsumerHandler(chan) {
		return async msg => {
			try {
				this.logger.debug(`AMQP message received in '${chan.name}' queue.`);
				const content = this.serializer.deserialize(msg.content);
				this.logger.debug("Content:", content);

				await chan.handler(content);
				this.channel.ack(msg);
			} catch (err) {
				this.logger.warn("Queue message processing error. Send NACK...", err);
				this.channel.nack(msg, false, true);
			}
		};
	}

	/**
	 * Unsubscribe from a channel.
	 *
	 * @param {Channel} chan
	 */
	async unsubscribe(chan) {
		this.logger.debug(`Unsubscribing from '${chan.name}' chan with '${chan.group}' group...'`);

		await this.channel.cancel(chan.id);
	}

	/**
	 * Publish a payload to a channel.
	 *
	 * @param {String} channelName
	 * @param {any} payload
	 * @param {Object?} opts
	 */
	async publish(channelName, payload, opts = {}) {
		// Available options: http://www.squaremobius.net/amqp.node/channel_api.html#channel_publish
		const messageOptions = _.defaultsDeep(
			{ persistent: opts.persistent, expiration: opts.ttl },
			this.opts.amqp.messageOptions
		);

		const data = this.serializer.serialize(payload);
		const res = this.channel.sendToQueue(channelName, data, messageOptions);
		if (res === false) throw MoleculerError("AMQP publish error. Write buffer is full.");
	}
}

module.exports = AmqpAdapter;
