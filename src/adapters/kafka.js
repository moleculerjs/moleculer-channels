/*
 * @moleculer/channels
 * Copyright (c) 2021 MoleculerJS (https://github.com/moleculerjs/channels)
 * MIT Licensed
 */

"use strict";

const BaseAdapter = require("./base");
const _ = require("lodash");
const { MoleculerError, MoleculerRetryableError } = require("moleculer").Errors;
const C = require("../constants");
/** Name of the partition where an error occurred while processing the message */
const HEADER_ORIGINAL_PARTITION = "x-original-partition";

/**
 * @typedef {import('kafkajs').Kafka} KafkaClient Kafka Client
 * @typedef {import('kafkajs').Producer} KafkaProducer Kafka Producer
 * @typedef {import('kafkajs').Consumer} KafkaConsumer Kafka Consumer
 * @typedef {import('kafkajs').KafkaConfig} KafkaConfig Kafka configuration
 * @typedef {import('kafkajs').ProducerConfig} ProducerConfig Kafka producer configuration
 * @typedef {import('kafkajs').ConsumerConfig} ConsumerConfig Kafka consumer configuration
 * @typedef {import('kafkajs').EachMessagePayload} EachMessagePayload Incoming message payload
 * @typedef {import("moleculer").ServiceBroker} ServiceBroker Moleculer Service Broker instance
 * @typedef {import("moleculer").LoggerInstance} Logger Logger instance
 * @typedef {import("../index").Channel} Channel Base channel definition
 * @typedef {import("./base").BaseDefaultOptions} BaseDefaultOptions Base adapter options
 */

/**
 * @typedef {Object} KafkaDefaultOptions Kafka Adapter configuration
 * @property {Number} maxInFlight Max-in-flight messages
 * @property {KafkaConfig} kafka Kafka config
 */

/** @type {KafkaClient} */
let Kafka;

/** @type {import('kafkajs').logLevel} */
let KafkaJsLogLevel;

function convertLogLevel(level) {
	switch (level) {
		case KafkaJsLogLevel.NOTHING:
		case KafkaJsLogLevel.ERROR:
		case KafkaJsLogLevel.WARN:
			return "warn";
		case KafkaJsLogLevel.DEBUG:
			return "debug";
		default:
			return "info";
	}
}

/**
 * Kafka adapter
 *
 * @class KafkaAdapter
 * @extends {BaseAdapter}
 */
class KafkaAdapter extends BaseAdapter {
	/**
	 * Constructor of adapter
	 * @param  {KafkaDefaultOptions|String?} opts
	 */
	constructor(opts) {
		if (_.isString(opts)) {
			opts = {
				kafka: {
					brokers: [opts.replace("kafka://", "")]
				}
			};
		}

		super(opts);

		/** @type {Logger} */
		this.kafkaLogger = null;

		/** @type {KafkaDefaultOptions & BaseDefaultOptions} */
		this.opts = _.defaultsDeep(this.opts, {
			maxInFlight: 1,
			kafka: {
				brokers: ["localhost:9092"],
				logCreator:
					() =>
					({ namespace, level, log }) => {
						this.kafkaLogger[convertLogLevel(level)](
							`[${namespace}${log.groupId != null ? ":" + log.groupId : ""}]`,
							log.message
						);
					},
				producerOptions: undefined,
				consumerOptions: undefined
			}
		});

		/** @type {KafkaClient} */
		this.client = null;

		/** @type {KafkaProducer} */
		this.producer = null;

		/**
		 * @type {Map<string,KafkaConsumer>}
		 */
		this.consumers = new Map();

		this.connected = false;
		this.stopping = false;
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
			Kafka = require("kafkajs").Kafka;
			KafkaJsLogLevel = require("kafkajs").logLevel;
		} catch (err) {
			/* istanbul ignore next */
			this.broker.fatal(
				"The 'kafkajs' package is missing! Please install it with 'npm install kafkajs --save' command.",
				err,
				true
			);
		}

		this.checkClientLibVersion("kafkajs", "^1.15.0");

		this.opts.kafka.clientId = this.opts.consumerName;

		this.kafkaLogger = this.broker.getLogger("Channels.KafkaJs");
	}

	/**
	 * Connect to the adapter with reconnecting logic
	 */
	connect() {
		return new Promise(resolve => {
			const doConnect = () => {
				this.tryConnect()
					.then(resolve)
					.catch(err => {
						this.logger.error("Unable to connect Kafka brokers.", err);
						setTimeout(() => {
							this.logger.info("Reconnecting...");
							doConnect();
						}, 2000);
					});
			};

			doConnect();
		});
	}

	/**
	 * Trying connect to the adapter.
	 */
	async tryConnect() {
		this.logger.debug("Connecting to Kafka brokers...", this.opts.kafka.brokers);

		this.client = new Kafka(this.opts.kafka);

		this.producer = this.client.producer(this.opts.kafka.producerOptions);
		await this.producer.connect();

		this.logger.info("Kafka adapter is connected.");

		this.connected = true;
	}

	/**
	 * Disconnect from adapter
	 */
	async disconnect() {
		if (this.stopping) return;

		this.stopping = true;
		try {
			this.logger.info("Closing Kafka connection...");
			if (this.producer) {
				await this.producer.disconnect();
				this.producer = null;
			}

			await new Promise((resolve, reject) => {
				const checkPendingMessages = () => {
					if (this.getNumberOfTrackedChannels() === 0) {
						// Stop the publisher client
						// The subscriber clients are stopped in unsubscribe() method, which is called in serviceStopping()
						const promises = Array.from(this.consumers.values()).map(consumer =>
							consumer.disconnect()
						);

						return Promise.all(promises)
							.then(() => {
								// Release the pointers
								this.consumers = new Map();
							})
							.then(() => {
								this.connected = false;
								resolve();
							})
							.catch(err => reject(err));
					} else {
						this.logger.warn(
							`Processing ${this.getNumberOfTrackedChannels()} active connections(s)...`
						);

						setTimeout(checkPendingMessages, 1000);
					}
				};

				setImmediate(checkPendingMessages);
			});
		} catch (err) {
			this.logger.error("Error while closing Kafka connection.", err);
		}
		this.stopping = false;
	}

	/**
	 * Subscribe to a channel.
	 *
	 * @param {Channel & KafkaDefaultOptions} chan
	 */
	async subscribe(chan) {
		this.logger.debug(
			`Subscribing to '${chan.name}' chan with '${chan.group}' group...'`,
			chan.id
		);

		try {
			if (chan.maxInFlight == null) chan.maxInFlight = this.opts.maxInFlight;
			if (chan.maxRetries == null) chan.maxRetries = this.opts.maxRetries;
			chan.deadLettering = _.defaultsDeep({}, chan.deadLettering, this.opts.deadLettering);
			if (chan.deadLettering.enabled) {
				chan.deadLettering.queueName = this.addPrefixTopic(chan.deadLettering.queueName);
				chan.deadLettering.exchangeName = this.addPrefixTopic(
					chan.deadLettering.exchangeName
				);
			}

			if (!chan.kafka) {
				chan.kafka = {};
			}

			let consumer = this.client.consumer({
				groupId: `${chan.group}:${chan.name}`,
				maxInFlightRequests: chan.maxInFlight,
				...(this.opts.kafka.consumerOptions || {}),
				...chan.kafka
			});
			this.consumers.set(chan.id, consumer);
			await consumer.connect();

			this.initChannelActiveMessages(chan.id);

			await consumer.subscribe({ topic: chan.name, fromBeginning: chan.kafka.fromBeginning });

			await consumer.run({
				autoCommit: false,
				partitionsConsumedConcurrently: chan.kafka.partitionsConsumedConcurrently,
				eachMessage: payload => this.processMessage(chan, consumer, payload)
			});
		} catch (err) {
			this.logger.error(
				`Error while subscribing to '${chan.name}' chan with '${chan.group}' group`,
				err
			);
			throw err;
		}
	}

	/**
	 * Commit new offset to Kafka broker.
	 *
	 * @param {KafkaConsumer} consumer
	 * @param {String} topic
	 * @param {Number} partition
	 * @param {String} offset
	 */
	async commitOffset(consumer, topic, partition, offset) {
		this.logger.debug("Committing new offset.", { topic, partition, offset });
		await consumer.commitOffsets([{ topic, partition, offset }]);
	}

	/**
	 * Process a message
	 *
	 * @param {Channel & KafkaDefaultOptions} chan
	 * @param {KafkaConsumer} consumer
	 * @param {EachMessagePayload} payload
	 * @returns {Promise<void>}
	 */
	async processMessage(chan, consumer, { topic, partition, message }) {
		// Service is stopping. Skip processing...
		if (chan.unsubscribing) return;

		this.logger.debug(
			`Kafka consumer received a message in '${chan.name}' queue. Processing...`,
			{
				topic,
				partition,
				offset: message.offset,
				headers: message.headers
			}
		);

		const id = `${partition}:${message.offset}`;
		const newOffset = Number(message.offset) + 1;

		// Check group filtering
		if (message.headers && message.headers[C.HEADER_GROUP]) {
			const group = message.headers[C.HEADER_GROUP].toString();
			if (group !== chan.group) {
				this.logger.debug(
					`The message is addressed to other group '${group}'. Current group: '${chan.group}'. Skipping...`
				);
				// Acknowledge
				await this.commitOffset(consumer, topic, partition, newOffset);
				return;
			}
		}

		try {
			this.addChannelActiveMessages(chan.id, [id]);

			const content = this.serializer.deserialize(message.value);
			//this.logger.debug("Content:", content);

			await chan.handler(content, message);

			this.logger.info("Message is processed. Committing offset", {
				topic,
				partition,
				offset: newOffset
			});
			// Acknowledge
			await this.commitOffset(consumer, topic, partition, newOffset);

			this.removeChannelActiveMessages(chan.id, [id]);
		} catch (err) {
			this.removeChannelActiveMessages(chan.id, [id]);

			this.metricsIncrement(C.METRIC_CHANNELS_MESSAGES_ERRORS_TOTAL, chan);

			this.logger.warn(`Kafka message processing error in '${chan.name}' queue.`, err);
			if (!chan.maxRetries) {
				if (chan.deadLettering.enabled) {
					// Reached max retries and has dead-letter topic, move message
					this.logger.debug(
						`No retries, moving message to '${chan.deadLettering.queueName}' queue...`
					);
					await this.moveToDeadLetter(chan, { topic, partition, message });
				} else {
					// No retries, drop message
					this.logger.error(`No retries, drop message...`);
				}
				await this.commitOffset(consumer, topic, partition, newOffset);
				return;
			}

			let redeliveryCount =
				message.headers[C.HEADER_REDELIVERED_COUNT] != null
					? Number(message.headers[C.HEADER_REDELIVERED_COUNT])
					: 0;
			redeliveryCount++;
			if (chan.maxRetries > 0 && redeliveryCount >= chan.maxRetries) {
				if (chan.deadLettering.enabled) {
					// Reached max retries and has dead-letter topic, move message
					this.logger.debug(
						`Message redelivered too many times (${redeliveryCount}). Moving message to '${chan.deadLettering.queueName}' queue...`
					);
					await this.moveToDeadLetter(chan, { topic, partition, message });
				} else {
					// Reached max retries and no dead-letter topic, drop message
					this.logger.error(
						`Message redelivered too many times (${redeliveryCount}). Drop message...`
					);
				}
			} else {
				// Redeliver the message
				this.logger.warn(
					`Redeliver message into '${chan.name}' topic. Count: ${redeliveryCount}`
				);

				await this.publish(chan.name, message.value, {
					raw: true,
					key: message.key,
					headers: Object.assign({}, message.headers, {
						[C.HEADER_REDELIVERED_COUNT]: redeliveryCount.toString(),
						[C.HEADER_GROUP]: chan.group
					})
				});

				this.metricsIncrement(C.METRIC_CHANNELS_MESSAGES_RETRIES_TOTAL, chan);
			}
			await this.commitOffset(consumer, topic, partition, newOffset);
		}
	}

	/**
	 * Moves message into dead letter
	 *
	 * @param {Channel} chan
	 * @param {Object} message message
	 */
	async moveToDeadLetter(chan, { partition, message }) {
		try {
			const headers = {
				...(message.headers || {}),
				[C.HEADER_ORIGINAL_CHANNEL]: chan.name,
				[C.HEADER_ORIGINAL_GROUP]: chan.group,
				[HEADER_ORIGINAL_PARTITION]: "" + partition
			};

			// Remove original group filter after redelivery.
			delete headers[C.HEADER_GROUP];

			await this.publish(chan.deadLettering.queueName, message.value, {
				raw: true,
				key: message.key,
				headers
			});

			this.metricsIncrement(C.METRIC_CHANNELS_MESSAGES_DEAD_LETTERING_TOTAL, chan);

			this.logger.warn(`Moved message to '${chan.deadLettering.queueName}'`, message.key);
		} catch (error) {
			this.logger.info("An error occurred while moving", error);
		}
	}

	/**
	 * Unsubscribe from a channel.
	 *
	 * @param {Channel & KafkaDefaultOptions} chan
	 */
	async unsubscribe(chan) {
		if (chan.unsubscribing) return;
		chan.unsubscribing = true;

		this.logger.debug(`Unsubscribing from '${chan.name}' chan with '${chan.group}' group...'`);

		const consumer = this.consumers.get(chan.id);
		if (!consumer) return;

		await new Promise((resolve, reject) => {
			const checkPendingMessages = () => {
				try {
					if (this.getNumberOfChannelActiveMessages(chan.id) === 0) {
						this.logger.debug(
							`Unsubscribing from '${chan.name}' chan with '${chan.group}' group...'`
						);

						// Stop tracking channel's active messages
						this.stopChannelActiveMessages(chan.id);

						resolve();
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

		// Disconnect consumer
		await consumer.disconnect();

		// Remove consumer
		this.consumers.delete(chan.id);
	}

	/**
	 * Publish a payload to a channel.
	 *
	 * @param {String} channelName
	 * @param {any} payload
	 * @param {Object?} opts
	 * @param {Boolean?} opts.raw
	 * @param {Buffer?|string?} opts.key
	 * @param {Number?} opts.partition
	 * @param {Object?} opts.headers
	 */
	async publish(channelName, payload, opts = {}) {
		// Adapter is stopping. Publishing no longer is allowed
		if (this.stopping) return;

		if (!this.connected) {
			throw new MoleculerRetryableError("Adapter not yet connected. Skipping publishing.");
		}

		this.logger.debug(`Publish a message to '${channelName}' topic...`, payload, opts);

		const data = opts.raw ? payload : this.serializer.serialize(payload);
		const res = await this.producer.send({
			topic: channelName,
			messages: [
				{ key: opts.key, value: data, partition: opts.partition, headers: opts.headers }
			],
			acks: opts.acks,
			timeout: opts.timeout,
			compression: opts.compression
		});

		if (res.length == 0 || res[0].errorCode != 0) {
			throw new MoleculerError(
				`Unable to publish message to '${channelName}'. Error code: ${res[0].errorCode}`,
				500,
				"UNABLE_PUBLISH",
				{ channelName, result: res }
			);
		}
		this.logger.debug(`Message was published at '${channelName}'`, res);
	}
}

module.exports = KafkaAdapter;
