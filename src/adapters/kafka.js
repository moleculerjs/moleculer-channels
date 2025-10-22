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
const { INVALID_MESSAGE_SERIALIZATION_ERROR_CODE } = require("../constants");
/** Name of the partition where an error occurred while processing the message */
const HEADER_ORIGINAL_PARTITION = "x-original-partition";

/**
 * @typedef {import('@platformatic/kafka')} KafkaLibRef Kafka Client
 * @typedef {import('@platformatic/kafka').Producer} KafkaProducer Kafka Producer
 * @typedef {import('@platformatic/kafka').Consumer} KafkaConsumer Kafka Consumer
 * @typedef {import('@platformatic/kafka').Admin} KafkaAdmin Kafka Admin
 * @typedef {import('@platformatic/kafka').AdminOptions} KafkaConfig Kafka configuration
 * @typedef {import('@platformatic/kafka').ProducerOptions<unknown, unknown, unknown, unknown>} ProducerConfig Kafka producer configuration
 * @typedef {import('@platformatic/kafka').ConsumerOptions<unknown, unknown, unknown, unknown>} ConsumerConfig Kafka consumer configuration
 * @typedef {import("moleculer").ServiceBroker} ServiceBroker Moleculer Service Broker instance
 * @typedef {import("moleculer").Logger} Logger Logger instance
 * @typedef {import("../index").Channel} Channel Base channel definition
 * @typedef {import("./base").BaseDefaultOptions} BaseDefaultOptions Base adapter options
 */

/**
 * @typedef {Object} KafkaDefaultOptions Kafka Adapter configuration
 * @property {Number} maxInFlight Max-in-flight messages
 * @property {KafkaConfig} kafka Kafka config
 */

/** @type {KafkaLibRef} */
let KafkaLibRef;

/** @type {import('hwp')}*/
let HWPRef;

/**
 * Kafka adapter
 *
 * @class KafkaAdapter
 * @extends {BaseAdapter}
 */
class KafkaAdapter extends BaseAdapter {
	/**
	 * Constructor of adapter
	 * @param  {KafkaDefaultOptions & BaseDefaultOptions|String?} opts
	 */
	constructor(opts) {
		if (_.isString(opts)) {
			opts = {
				kafka: {
					bootstrapBrokers: [opts.replace("kafka://", "")]
				}
			};
		}

		super(opts);

		/** @type {KafkaDefaultOptions & BaseDefaultOptions} */
		this.opts = _.defaultsDeep(this.opts, {
			maxInFlight: 1,
			kafka: {
				bootstrapBrokers: ["localhost:9092"],
				producerOptions: {},
				consumerOptions: undefined
			}
		});

		/** @type {KafkaConsumer} */
		this.client = null;

		/** @type {KafkaProducer} */
		this.producer = null;

		/** @type {KafkaAdmin} */
		this.admin = null;

		/** @type {Set<string>} */
		this.existingTopics = new Set();

		/**
		 * @type {Map<string,KafkaConsumer>}
		 */
		this.consumers = new Map();
		this.consumerStreams = new Map();

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
			KafkaLibRef = require("@platformatic/kafka");
		} catch (err) {
			/* istanbul ignore next */
			this.broker.fatal(
				"The '@platformatic/kafka' package is missing! Please install it with 'npm install @platformatic/kafka --save' command.",
				err,
				true
			);
		}

		try {
			HWPRef = require("hwp");
		} catch (err) {
			/* istanbul ignore next */
			this.broker.fatal(
				"The 'hwp' package is missing! Please install it with 'npm install hwp --save' command.",
				err,
				true
			);
		}

		// this.checkClientLibVersion("@platformatic/kafka", "^1.15.0 || ^2.0.0");

		this.opts.kafka.clientId = this.opts.consumerName;
	}

	/**
	 * https://github.com/platformatic/kafka/blob/main/docs/other.md#serialisation-and-deserialisation
	 *
	 * @param {any} data
	 * @returns {Buffer}
	 */
	_serialize(data) {
		try {
			return this.serializer.serialize(data);
		} catch (e) {
			throw new MoleculerError(
				"Unable to serialize message for Kafka producer.",
				500,
				C.SERIALIZER_FAILED_ERROR_CODE,
				{ error: e }
			);
		}
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

		this.admin = new KafkaLibRef.Admin(this.opts.kafka);

		this.producer = new KafkaLibRef.Producer({
			serializers: {
				key: KafkaLibRef.stringSerializers.key,
				value: data => data,
				headerKey: KafkaLibRef.stringSerializers.headerKey,
				headerValue: KafkaLibRef.stringSerializers.headerValue
			},
			...this.opts.kafka.producerOptions,
			bootstrapBrokers: this.opts.kafka.bootstrapBrokers
		});

		await Promise.all([this.admin.connectToBrokers(), this.producer.connectToBrokers()]);

		const topics = await this.admin.listTopics();
		this.logger.debug("Kafka topics:", topics);
		topics.forEach(topic => this.existingTopics.add(topic));

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
				await this.producer.close();
				this.producer = null;
			}

			if (this.admin) {
				await this.admin.close();
				this.admin = null;
			}

			await new Promise((resolve, reject) => {
				const checkPendingMessages = () => {
					if (this.getNumberOfTrackedChannels() === 0) {
						// Stop the publisher client
						// The subscriber clients are stopped in unsubscribe() method, which is called in serviceStopping()
						const promises = Array.from(this.consumers.values()).map(async consumer => {
							await consumer.leaveGroup();
							await consumer.close();
						});

						const promisesStream = Array.from(this.consumerStreams.values()).map(
							stream => stream.close()
						);

						return Promise.all(promisesStream)
							.then(() => {
								// Release the stream pointers
								this.consumerStreams = new Map();
							})
							.then(() => Promise.all(promises))
							.then(() => {
								// Release the consumer pointers
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

			// const consumer = this.client.consumer({
			// 	groupId: `${chan.group}:${chan.name}`,
			// 	maxInFlightRequests: chan.maxInFlight,
			// 	...(this.opts.kafka.consumerOptions || {}),
			// 	...chan.kafka
			// });

			const consumer = new KafkaLibRef.Consumer({
				...this.opts.kafka.consumerOptions,
				...chan.kafka,
				deserializers: {
					key: KafkaLibRef.stringDeserializers.key,
					value: data => data, // leave as buffer for custom deserialization
					headerKey: KafkaLibRef.stringDeserializers.headerKey,
					headerValue: KafkaLibRef.stringDeserializers.headerValue
				},
				groupId: `${chan.group}:${chan.name}`,
				bootstrapBrokers: this.opts.kafka.bootstrapBrokers
			});

			this.consumers.set(chan.id, consumer);
			await consumer.connectToBrokers();

			this.initChannelActiveMessages(chan.id);

			// Old KafkaJS code:
			// await consumer.subscribe({ topic: chan.name, fromBeginning: chan.kafka.fromBeginning });
			// await consumer.run({
			// 	autoCommit: false,
			// 	partitionsConsumedConcurrently: chan.kafka.partitionsConsumedConcurrently,
			// 	eachMessage: payload => this.processMessage(chan, consumer, payload)
			// });

			// New Platformatic Kafka code:

			// check if topic exists
			if (!this.existingTopics.has(chan.name)) {
				// Create topic if not exists
				this.logger.warn(
					`The topic '${chan.name}' does not exist. Creating the topic automatically...`
				);
				this.existingTopics.add(chan.name);
				await this.admin.createTopics({ topics: [chan.name] });
			}

			// Start consuming messages
			this.logger.debug(
				`Configuring consumer stream for '${chan.name}' topic at '${chan.id}'...`
			);
			const consumerStream = await consumer.consume({
				...this.opts.kafka.consumerOptions,
				...chan.kafka,
				autocommit: false,
				topics: [chan.name],
				// More info: https://github.com/platformatic/kafka/blob/main/docs/consumer.md
				mode: this.opts.kafka.consumerOptions?.mode || "committed"
			});

			this.consumerStreams.set(chan.id, consumerStream);

			// run detached so we don't block broker's startup process
			HWPRef.forEach(
				consumerStream,
				async message => {
					await this.processMessage(chan, consumer, message).catch(err => {
						this.logger.error(
							`Error while processing message at '${chan.name}' topic in '${chan.id}'...`,
							err
						);
					});
				},
				chan.maxInFlight
			).catch(err => {
				this.logger.error(
					`Error in HWP processing for '${chan.name}' topic in '${chan.id}'...`,
					err
				);
			});

			consumerStream.on("error", err => {
				this.logger.error(
					`Consumer stream error at '${chan.id}' for '${chan.name}' topic`,
					err
				);
			});

			consumerStream.on("end", () => {
				this.logger.debug(`Consumer stream ended at '${chan.id}' for '${chan.name}' topic`);
			});

			this.logger.info(
				`Subscribed to '${chan.name}' chan with '${chan.group}' group.`,
				chan.id
			);
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
	 * @param {string} topic
	 * @param {number} partition
	 * @param {bigint} offset
	 * @param {number?} leaderEpoch
	 */
	async commitOffset(consumer, topic, partition, offset, leaderEpoch) {
		this.logger.debug("Committing new offset.", { topic, partition, offset, leaderEpoch });
		await consumer.commit({
			offsets: [{ topic, partition, offset, leaderEpoch }]
		});
		// Old KafkaJS code:
		// await consumer.commitOffsets([{ topic, partition, offset }]);
	}

	/**
	 * Process a message
	 *
	 * @param {Channel & KafkaDefaultOptions} chan
	 * @param {KafkaConsumer} consumer
	 * @param {import('@platformatic/kafka').Message<string, Buffer, string, string>} message
	 * @returns {Promise<void>}
	 */
	async processMessage(chan, consumer, message) {
		const { topic, partition, value, commit, headers, key, offset, timestamp } = message;

		// Service is stopping. Skip processing...
		if (chan.unsubscribing) return;

		this.logger.debug(
			`Kafka consumer received a message in '${chan.name}' queue. Processing...`,
			{ topic, partition, offset, headers }
		);

		const id = `${partition}:${offset}`;
		const newOffset = BigInt(Number(offset) + 1);

		// Check group filtering
		if (headers && headers.has(C.HEADER_GROUP)) {
			const group = headers.get(C.HEADER_GROUP).toString();
			if (group !== chan.group) {
				this.logger.debug(
					`The message is addressed to other group '${group}'. Current group: '${chan.group}'. Skipping...`
				);
				// Acknowledge
				await commit();
				// await this.commitOffset(consumer, topic, partition, newOffset, leaderEpoch);
				return;
			}
		}

		/**
		 * @type {unknown} Will contain the deserialized message content
		 */
		let content;
		try {
			this.addChannelActiveMessages(chan.id, [id]);

			try {
				content = this.serializer.deserialize(value);
			} catch (error) {
				const msg = `Failed to parse incoming message at '${chan.name}' channel. Incoming messages must use ${this.opts.serializer} serialization.`;
				throw new MoleculerError(msg, 400, INVALID_MESSAGE_SERIALIZATION_ERROR_CODE, {
					error
				});
			}
			//this.logger.debug("Content:", content);

			await chan.handler(content, message);

			this.logger.info("Message is processed. Committing offset", {
				topic,
				partition,
				offset: newOffset
			});
			// Acknowledge
			await commit();
			// await this.commitOffset(consumer, topic, partition, newOffset, leaderEpoch);

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
					await this.moveToDeadLetter(
						chan,
						{ topic, partition, message },
						this.transformErrorToHeaders(err)
					);
				} else {
					// No retries, drop message
					this.logger.error(`No retries, drop message...`);
				}
				await commit();
				// await this.commitOffset(consumer, topic, partition, newOffset, leaderEpoch);
				return;
			}

			let redeliveryCount = headers.has(C.HEADER_REDELIVERED_COUNT)
				? Number(headers.get(C.HEADER_REDELIVERED_COUNT))
				: 0;
			redeliveryCount++;
			if (chan.maxRetries > 0 && redeliveryCount >= chan.maxRetries) {
				if (chan.deadLettering.enabled) {
					// Reached max retries and has dead-letter topic, move message
					this.logger.debug(
						`Message redelivered too many times (${redeliveryCount}). Moving message to '${chan.deadLettering.queueName}' queue...`
					);
					await this.moveToDeadLetter(
						chan,
						{ topic, partition, message },
						this.transformErrorToHeaders(err)
					);
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

				await this.publish(chan.name, value, {
					raw: true,
					key: key,
					headers: Object.assign({}, Object.fromEntries(headers ?? []), {
						[C.HEADER_REDELIVERED_COUNT]: redeliveryCount.toString(),
						[C.HEADER_GROUP]: chan.group
					})
				});

				this.metricsIncrement(C.METRIC_CHANNELS_MESSAGES_RETRIES_TOTAL, chan);
			}
			await commit();
			// await this.commitOffset(consumer, topic, partition, newOffset, leaderEpoch);
		}
	}

	/**
	 * Moves message into dead letter
	 *
	 * @param {Channel} chan
	 * @param {Object} message message
	 * @param {Record<string, any>} [errorData] Optional error data to store as headers
	 */
	async moveToDeadLetter(chan, { partition, message }, errorData) {
		try {
			const headers = {
				...(message.headers || {}),
				[C.HEADER_ORIGINAL_CHANNEL]: chan.name,
				[C.HEADER_ORIGINAL_GROUP]: chan.group,
				[HEADER_ORIGINAL_PARTITION]: "" + partition
			};

			if (errorData) {
				Object.entries(errorData).forEach(([key, value]) => (headers[key] = value));
			}

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
			this.logger.error("An error occurred while moving", error);
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

		// Stop consumer stream first
		const consumerStream = this.consumerStreams.get(chan.id);
		if (consumerStream) {
			await consumerStream.close();
			this.consumerStreams.delete(chan.id);
		}

		// Disconnect consumer
		await consumer.close();

		// Remove consumer
		this.consumers.delete(chan.id);
	}

	/**
	 * Publish a payload to a channel.
	 *
	 * @param {String} channelName
	 * @param {any} payload
	 * @param {Object} [opts]
	 * @param {boolean} [opts.raw]
	 * @param {Buffer|string} [opts.key]
	 * @param {number} [opts.partition]
	 * @param {Record<string, string>} [opts.headers]
	 * @param {number} [opts.acks]
	 * @param {"none" | "gzip" | "snappy" | "lz4" | "zstd"} [opts.compression]
	 * @param {boolean} [opts.idempotent]
	 */
	async publish(channelName, payload, opts = {}) {
		// Adapter is stopping. Publishing no longer is allowed
		if (this.stopping) return;

		if (!this.connected) {
			throw new MoleculerRetryableError("Adapter not yet connected. Skipping publishing.");
		}

		this.logger.debug(`Publish a message to '${channelName}' topic...`, payload, opts);

		const data = opts.raw ? payload : this._serialize(payload);
		// const data = opts.raw ? payload : this.serializer.serialize(payload);
		// old KafkaJS code:
		// const res = await this.producer.send({
		// 	topic: channelName,
		// 	messages: [
		// 		{ key: opts.key, value: data, partition: opts.partition, headers: opts.headers }
		// 	],
		// 	acks: opts.acks,
		// 	timeout: opts.timeout,
		// 	compression: opts.compression
		// });

		const res = await this.producer.send({
			messages: [
				{
					// generate random message value
					value: data,
					key: opts.key,
					partition: opts.partition,
					headers: opts.headers,
					topic: channelName
				}
			],
			autocreateTopics: true,
			acks: opts.acks,
			compression: opts.compression,
			idempotent: opts.idempotent
		});

		// old KafkaJS code:
		// if (res.length == 0 || res[0].errorCode != 0) {
		// 	throw new MoleculerError(
		// 		`Unable to publish message to '${channelName}'. Error code: ${res[0].errorCode}`,
		// 		500,
		// 		"UNABLE_PUBLISH",
		// 		{ channelName, result: res }
		// 	);
		// }
		this.logger.debug(`Message was published at '${channelName}'`, res);
	}

	/**
	 * Parse the headers from incoming message to a POJO.
	 * @param {any} raw
	 * @returns {object}
	 */
	parseMessageHeaders(raw) {
		if (raw.headers) {
			const res = {};
			for (const [key, value] of raw.headers.entries()) {
				res[key] = value != null ? value.toString() : null;
			}

			return res;
		}
		return null;
	}
}

module.exports = KafkaAdapter;
