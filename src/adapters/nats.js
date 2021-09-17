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
 * @typedef {import("nats").JetStreamOptions} JetStreamOptions Jet Stream Options
 * @typedef {import("nats").JsMsg} JsMsg Jet Stream Message
 * @typedef {import("nats").JetStreamSubscription} JetStreamSubscription Jet Stream Subscription
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

		/** @type {JetStreamClient} */
		this.client = null;

		/** @type {Map<string,JetStreamSubscription>} */
		this.subscriptions = new Map();
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
		this.connection = await NATS.connect();

		this.manager = await this.connection.jetstreamManager();

		this.client = await this.connection.jetstream(); // JetStreamOptions
	}

	/**
	 * Disconnect from adapter
	 */
	async disconnect() {
		this.stopping = true;

		try {
			if (this.connection) {
				this.logger.info("Closing NATS JetStream connection...");
				// await this.connection.drain();
				await this.connection.close();

				this.logger.info("NATS JetStream connection closed.");
			}
		} catch (error) {
			this.logger.error("Error while closing NATS JetStream connection.", error);
		}
	}

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

		// 2. Configure NATS consumer
		this.initChannelActiveMessages(chan.id);

		// More info: https://docs.nats.io/jetstream/concepts/consumers#maxackpending
		/** @type {ConsumerOptsBuilder} */
		const consumerOpts = NATS.consumerOpts();
		consumerOpts.queue(streamName);
		consumerOpts.durable(chan.name.split(".").join("_"));
		consumerOpts.deliverTo(chan.id);
		consumerOpts.manualAck();
		consumerOpts.deliverNew();
		consumerOpts.maxAckPending(chan.maxInFlight);
		// Register the actual handler
		consumerOpts.callback(this.createConsumerHandler(chan));

		// 3. Create a subscription
		try {
			const sub = await this.client.subscribe(chan.name, consumerOpts);
			this.subscriptions.set(chan.id, sub);
		} catch (error) {
			this.logger.error(`An error ocurred when subscribing to a ${chan.name}`, error);
		}
	}

	/**
	 * Creates the callback handler
	 *
	 * @param {Channel} chan
	 * @returns
	 */
	createConsumerHandler(chan) {
		/**
		 * @param {import("nats").NatsError} err
		 * @param {JsMsg} message
		 */
		return async (err, message) => {
			// NATS "regular" message with stats. Not a JetStream message
			// Both err and message are "null"
			// More info: https://github.com/nats-io/nats.deno/blob/main/jetstream.md#callbacks
			if (err === null && message === null) return;

			if (err) {
				this.logger.error(err);
				return;
			}

			if (message) {
				this.addChannelActiveMessages(chan.id, [message.seq]);

				try {
					// Working on the message and thus prevent receiving the message again as a redelivery.
					message.working();
					await chan.handler(this.serializer.deserialize(message.data), message);
					message.ack();
				} catch (error) {
					this.logger.error(error);

					// Message rejected
					if (!chan.maxRetries) {
						// No retries

						if (chan.deadLettering.enabled) {
							await this.moveToDeadLetter(chan, message);
						} else {
							// Drop message
							this.logger.error(`Drop message...`, message.seq);
						}

						message.ack();
					} else {
						if (message.info.redeliveryCount < chan.maxRetries) {
							message.nak();
						} else {
							await this.moveToDeadLetter(chan, message);
							message.ack();
						}
					}
				}

				this.removeChannelActiveMessages(chan.id, [message.seq]);
			}
		};
	}

	/**
	 * Moves message into dead letter
	 *
	 * @param {Channel} chan
	 * @param {JsMsg} message JetStream message
	 */
	async moveToDeadLetter(chan, message) {
		this.logger.warn(`Moved message to '${chan.deadLettering.queueName}'`);
	}

	/**
	 * Unsubscribe from a channel.
	 *
	 * @param {Channel} chan
	 */
	async unsubscribe(chan) {
		chan.unsubscribing = true;
		const sub = this.subscriptions.get(chan.id);
		if (!sub) return;

		await new Promise((resolve, reject) => {
			const checkPendingMessages = () => {
				try {
					if (this.getNumberOfChannelActiveMessages(chan.id) === 0) {
						return sub
							.drain()
							.then(() => sub.destroy())
							.then(() => {
								this.logger.debug(
									`Unsubscribing from '${chan.name}' chan with '${chan.group}' group...'`
								);

								// Stop tracking channel's active messages
								this.stopChannelActiveMessages(chan.id);

								resolve();
							});
					} else {
						this.logger.warn(
							`Processing ${this.getNumberOfChannelActiveMessages(
								chan.id
							)} message(s) of '${chan.id}'...`
						);

						setTimeout(() => checkPendingMessages(), 1000);
					}
				} catch (err) {
					reject(err);
				}
			};

			checkPendingMessages();
		});
	}

	/**
	 * Publish a payload to a channel.
	 *
	 * @param {String} channelName
	 * @param {any} payload
	 * @param {Partial<JetStreamPublishOptions>?} opts
	 */
	async publish(channelName, payload, opts = {}) {
		this.logger.info(`${channelName} -- NATS out =>`);

		try {
			const response = await this.client.publish(
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
