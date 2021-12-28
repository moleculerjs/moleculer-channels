/*
 * @moleculer/channels
 * Copyright (c) 2021 MoleculerJS (https://github.com/moleculerjs/channels)
 * MIT Licensed
 */

"use strict";

const BaseAdapter = require("./base");
const _ = require("lodash");
const C = require("../constants");
const { MoleculerRetryableError } = require("moleculer").Errors;

let NATS;

/**
 * @typedef {import("nats").NatsConnection} NatsConnection NATS Connection
 * @typedef {import("nats").ConnectionOptions} ConnectionOptions NATS Connection Opts
 * @typedef {import("nats").StreamConfig} StreamConfig NATS Configuration Options
 * @typedef {import("nats").JetStreamManager} JetStreamManager NATS Jet Stream Manager
 * @typedef {import("nats").JetStreamClient} JetStreamClient NATS JetStream Client
 * @typedef {import("nats").JetStreamPublishOptions} JetStreamPublishOptions JetStream Publish Options
 * @typedef {import("nats").ConsumerOptsBuilder} ConsumerOptsBuilder NATS JetStream ConsumerOptsBuilder
 * @typedef {import("nats").ConsumerOpts} ConsumerOpts Jet Stream Consumer Opts
 * @typedef {import("nats").JetStreamOptions} JetStreamOptions Jet Stream Options
 * @typedef {import("nats").JsMsg} JsMsg Jet Stream Message
 * @typedef {import("nats").JetStreamSubscription} JetStreamSubscription Jet Stream Subscription
 * @typedef {import("nats").MsgHdrs} MsgHdrs Jet Stream Headers
 * @typedef {import("moleculer").ServiceBroker} ServiceBroker Moleculer Service Broker instance
 * @typedef {import("moleculer").LoggerInstance} Logger Logger instance
 * @typedef {import("../index").Channel} Channel Base channel definition
 * @typedef {import("./base").BaseDefaultOptions} BaseDefaultOptions Base adapter options
 */

/**
 * @typedef {Object} NatsDefaultOptions
 * @property {Object} nats NATS lib configuration
 * @property {String} url String containing the URL to NATS server
 * @property {ConnectionOptions} nats.connectionOptions
 * @property {StreamConfig} nats.streamConfig More info: https://docs.nats.io/jetstream/concepts/streams
 * @property {ConsumerOpts} nats.consumerOptions More info: https://docs.nats.io/jetstream/concepts/consumers
 */

/**
 * NATS JetStream adapter
 *
 * More info: https://github.com/nats-io/nats.deno/blob/main/jetstream.md
 * More info: https://github.com/nats-io/nats-architecture-and-design#jetstream
 * More info: https://docs.nats.io/jetstream/concepts/
 *
 * @class NatsAdapter
 * @extends {BaseAdapter}
 */
class NatsAdapter extends BaseAdapter {
	constructor(opts) {
		if (_.isString(opts)) opts = { url: opts };

		super(opts);

		/** @type { BaseDefaultOptions & NatsDefaultOptions } */
		this.opts = _.defaultsDeep(this.opts, {
			nats: {
				/** @type {ConnectionOptions} */
				connectionOptions: {},
				/** @type {StreamConfig} More info: https://docs.nats.io/jetstream/concepts/streams */
				streamConfig: {},
				/** @type {ConsumerOpts} More info: https://docs.nats.io/jetstream/concepts/consumers */
				consumerOptions: {
					// Manual ACK
					mack: true,
					config: {
						// More info: https://docs.nats.io/jetstream/concepts/consumers#deliverpolicy-optstartseq-optstarttime
						deliver_policy: "new",
						// More info: https://docs.nats.io/jetstream/concepts/consumers#ackpolicy
						ack_policy: "explicit",
						// More info: https://docs.nats.io/jetstream/concepts/consumers#maxackpending
						max_ack_pending: this.opts.maxInFlight
					}
				}
			}
		});

		// Adapted from: https://github.com/moleculerjs/moleculer/blob/3f7e712a8ce31087c7d333ad9dbaf63617c8497b/src/transporters/nats.js#L141-L143
		if (this.opts.nats.url)
			this.opts.nats.connectionOptions.servers = this.opts.nats.url
				.split(",")
				.map(server => new URL(server).host);

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
		this.connection = await NATS.connect(this.opts.nats.connectionOptions);

		this.manager = await this.connection.jetstreamManager();

		this.client = this.connection.jetstream(); // JetStreamOptions

		this.connected = true;
	}

	/**
	 * Disconnect from adapter
	 */
	async disconnect() {
		this.stopping = true;

		try {
			if (this.connection) {
				this.logger.info("Closing NATS JetStream connection...");
				await this.connection.drain();
				await this.connection.close();

				this.logger.info("NATS JetStream connection closed.");
			}
		} catch (error) {
			this.logger.error("Error while closing NATS JetStream connection.", error);
		}

		this.connected = false;
	}

	/**
	 * Subscribe to a channel with a handler.
	 *
	 * @param {Channel & NatsDefaultOptions} chan
	 */
	async subscribe(chan) {
		this.logger.debug(
			`Subscribing to '${chan.name}' chan with '${chan.group}' group...'`,
			chan.id
		);

		if (chan.maxInFlight == null) chan.maxInFlight = this.opts.maxInFlight;
		if (chan.maxRetries == null) chan.maxRetries = this.opts.maxRetries;

		chan.deadLettering = _.defaultsDeep({}, chan.deadLettering, this.opts.deadLettering);
		if (chan.deadLettering.enabled) {
			chan.deadLettering.queueName = this.addPrefixTopic(chan.deadLettering.queueName);
		}

		// 1. Create stream
		// NATS Stream name does not support: spaces, tabs, period (.), greater than (>) or asterisk (*) are prohibited.
		// More info: https://docs.nats.io/jetstream/administration/naming
		const streamName = chan.name.split(".").join("_");
		this.createStream(streamName, [chan.name], chan.nats ? chan.nats.streamConfig : {});

		if (chan.deadLettering && chan.deadLettering.enabled) {
			const deadLetteringStreamName = chan.deadLettering.queueName.split(".").join("_");
			this.createStream(
				deadLetteringStreamName,
				[chan.deadLettering.queueName],
				chan.nats ? chan.nats.streamConfig : {}
			);
		}

		// 2. Configure NATS consumer
		this.initChannelActiveMessages(chan.id);

		/** @type {ConsumerOpts} More info: https://docs.nats.io/jetstream/concepts/consumers */
		const consumerOpts = _.defaultsDeep(
			{},
			chan.nats ? chan.nats.consumerOptions : {},
			this.opts.nats.consumerOptions
		);

		consumerOpts.queue = streamName;
		consumerOpts.config.deliver_group = streamName;
		// NATS Stream name does not support: spaces, tabs, period (.), greater than (>) or asterisk (*) are prohibited.
		// More info: https://docs.nats.io/jetstream/administration/naming
		consumerOpts.config.durable_name = chan.group.split(".").join("_");
		consumerOpts.config.deliver_subject = chan.id;
		consumerOpts.config.max_ack_pending = chan.maxInFlight;
		consumerOpts.callbackFn = this.createConsumerHandler(chan);

		// 3. Create a subscription
		try {
			const sub = await this.client.subscribe(chan.name, consumerOpts);
			this.subscriptions.set(chan.id, sub);
		} catch (err) {
			this.logger.error(
				`Error while subscribing to '${chan.name}' chan with '${chan.group}' group`,
				err
			);
			throw err;
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
			// Service is stopping. Skip processing...
			if (chan.unsubscribing) return;

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
					// this.logger.error(error);
					this.metricsIncrement(C.METRIC_CHANNELS_MESSAGES_ERRORS_TOTAL, chan);

					// Message rejected
					if (!chan.maxRetries) {
						// No retries

						if (chan.deadLettering.enabled) {
							this.logger.debug(
								`No retries, moving message to '${chan.deadLettering.queueName}' queue...`
							);
							await this.moveToDeadLetter(chan, message);
						} else {
							// Drop message
							this.logger.error(`No retries, drop message...`, message.seq);
						}

						message.ack();
					} else if (
						chan.maxRetries > 0 &&
						message.info.redeliveryCount >= chan.maxRetries
					) {
						// Retries enabled and limit reached

						if (chan.deadLettering.enabled) {
							this.logger.debug(
								`Message redelivered too many times (${message.info.redeliveryCount}). Moving message to '${chan.deadLettering.queueName}' queue...`
							);
							await this.moveToDeadLetter(chan, message);
						} else {
							// Drop message
							this.logger.error(
								`Message redelivered too many times (${message.info.redeliveryCount}). Drop message...`,
								message.seq
							);
							// this.logger.error(`Drop message...`, message.seq);
						}

						message.ack();
					} else {
						// Retries enabled but limit NOT reached
						// NACK the message for redelivery
						this.metricsIncrement(C.METRIC_CHANNELS_MESSAGES_RETRIES_TOTAL, chan);

						this.logger.debug(`NACKing message...`, message.seq);
						message.nak();
					}
				}

				this.removeChannelActiveMessages(chan.id, [message.seq]);
			}
		};
	}

	/**
	 * Create a NATS Stream
	 *
	 * More info: https://docs.nats.io/jetstream/concepts/streams
	 *
	 * @param {String} streamName Name of the Stream
	 * @param {Array<String>} subjects A list of subjects/topics to store in a stream
	 * @param {StreamConfig} streamOpts JetStream stream configs
	 */
	async createStream(streamName, subjects, streamOpts) {
		const streamConfig = _.defaultsDeep(
			{
				name: streamName,
				subjects: subjects
			},
			streamOpts,
			this.opts.nats.streamConfig
		);

		try {
			const streamInfo = await this.manager.streams.add(streamConfig);
			this.logger.debug(streamInfo);
		} catch (error) {
			if (error.message === "stream name already in use") {
				// Silently ignore the error. Channel or Consumer Group already exists
				this.logger.debug(`NATS Stream with name: '${streamName}' already exists.`);
			} else {
				this.logger.error("An error ocurred while create NATS Stream", error);
			}
		}
	}

	/**
	 * Moves message into dead letter
	 *
	 * @param {Channel} chan
	 * @param {JsMsg} message JetStream message
	 */
	async moveToDeadLetter(chan, message) {
		// this.logger.warn(`Moved message to '${chan.deadLettering.queueName}'`);
		try {
			/** @type {JetStreamPublishOptions} */
			const opts = {
				raw: true,
				headers: {
					// Add info about original channel where error occurred
					[C.HEADER_ORIGINAL_CHANNEL]: chan.name,
					[C.HEADER_ORIGINAL_GROUP]: chan.group
				}
			};

			await this.publish(chan.deadLettering.queueName, message.data, opts);

			this.metricsIncrement(C.METRIC_CHANNELS_MESSAGES_DEAD_LETTERING_TOTAL, chan);

			this.logger.warn(`Moved message to '${chan.deadLettering.queueName}'`, message.seq);
		} catch (error) {
			this.logger.info("An error occurred while moving", error);
		}
	}

	/**
	 * Unsubscribe from a channel.
	 *
	 * @param {Channel} chan
	 */
	async unsubscribe(chan) {
		if (chan.unsubscribing) return;
		chan.unsubscribing = true;

		const sub = this.subscriptions.get(chan.id);
		if (!sub) return;

		await new Promise((resolve, reject) => {
			const checkPendingMessages = () => {
				try {
					if (this.getNumberOfChannelActiveMessages(chan.id) === 0) {
						// More info: https://github.com/nats-io/nats.deno/blob/main/jetstream.md#push-subscriptions
						return sub
							.drain()
							.then(() => sub.unsubscribe())
							.then(() => {
								this.logger.debug(
									`Unsubscribing from '${chan.name}' chan with '${chan.group}' group...'`
								);

								// Stop tracking channel's active messages
								this.stopChannelActiveMessages(chan.id);

								resolve();
							})
							.catch(err => reject(err));
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
		// Adapter is stopping. Publishing no longer is allowed
		if (this.stopping) return;

		if (!this.connected) {
			throw new MoleculerRetryableError("Adapter not yet connected. Skipping publishing.");
		}

		try {
			// Remap headers into JetStream format
			if (opts.headers) {
				/** @type {MsgHdrs} */
				let msgHdrs = NATS.headers();

				Object.keys(opts.headers).forEach(key => {
					msgHdrs.set(key, opts.headers[key]);
				});

				opts.headers = msgHdrs;
			}

			const response = await this.client.publish(
				channelName,
				opts.raw ? payload : this.serializer.serialize(payload),
				opts
			);

			this.logger.debug(`Message ${response.seq} was published at '${channelName}'`);
		} catch (error) {
			this.logger.error(`An error ocurred while publishing message to ${channelName}`, error);
			throw error;
		}
	}
}

module.exports = NatsAdapter;
