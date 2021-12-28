/*
 * @moleculer/channels
 * Copyright (c) 2021 MoleculerJS (https://github.com/moleculerjs/channels)
 * MIT Licensed
 */

"use strict";

const _ = require("lodash");
const BaseAdapter = require("./base");
const { ServiceSchemaError, MoleculerRetryableError } = require("moleculer").Errors;
const C = require("../constants");
/** Redis generated ID of the message that was not processed properly*/
const HEADER_ORIGINAL_ID = "x-original-id";

let Redis;

/**
 * @typedef {import("ioredis").Cluster} Cluster Redis cluster instance. More info: https://github.com/luin/ioredis/blob/master/API.md#Cluster
 * @typedef {import("ioredis").Redis} Redis Redis instance. More info: https://github.com/luin/ioredis/blob/master/API.md#Redis
 * @typedef {import("ioredis").RedisOptions} RedisOptions
 * @typedef {import("moleculer").ServiceBroker} ServiceBroker Moleculer Service Broker instance
 * @typedef {import("moleculer").LoggerInstance} Logger Logger instance
 * @typedef {import("../index").Channel} Channel Base channel definition
 * @typedef {import("./base").BaseDefaultOptions} BaseDefaultOptions Base adapter options
 */

/**
 * @typedef {Object} RedisDefaultOptions Redis Adapter configuration
 * @property {Number} readTimeoutInterval Timeout interval (in milliseconds) while waiting for new messages. By default equals to 0, i.e., never timeout
 * @property {Number} minIdleTime Time (in milliseconds) after which pending messages are considered NACKed and should be claimed. Defaults to 1 hour.
 * @property {Number} claimInterval Interval (in milliseconds) between message claims
 * @property {String} startID Starting point when consumers fetch data from the consumer group. By default equals to "$", i.e., consumers will only see new elements arriving in the stream.
 * @property {Number} processingAttemptsInterval Interval (in milliseconds) between message transfer into FAILED_MESSAGES channel
 */

/**
 * @typedef {Object} RedisChannel Redis specific channel options
 * @property {Function} xreadgroup Function for fetching new messages from redis stream
 * @property {Function} xclaim Function for claiming pending messages
 * @property {Function} failed_messages Function for checking NACKed messages and moving them into dead letter queue
 * @property {RedisDefaultOptions} redis
 */

/**
 * @typedef {Object} RedisOpts
 * @property {Object} redis Redis lib configuration
 * @property {RedisDefaultOptions} redis.consumerOptions
 */

/**
 * Redis Streams adapter
 *
 * @class RedisAdapter
 * @extends {BaseAdapter}
 */
class RedisAdapter extends BaseAdapter {
	/**
	 * Constructor of adapter.
	 *
	 * @param  {Object?} opts
	 */
	constructor(opts) {
		if (_.isString(opts))
			opts = {
				redis: {
					url: opts
				}
			};

		if (opts && _.isString(opts.redis)) {
			opts = {
				...opts,
				redis: {
					url: opts.redis
				}
			};
		}

		super(opts);

		/** @type {RedisOpts & BaseDefaultOptions} */
		this.opts = _.defaultsDeep(this.opts, {
			redis: {
				consumerOptions: {
					// Timeout interval (in milliseconds) while waiting for new messages
					// By default never timeout
					readTimeoutInterval: 0,
					// Time (in milliseconds) after which pending messages are considered NACKed and should be claimed. Defaults to 1 hour.
					minIdleTime: 60 * 60 * 1000,
					// Time between claims (in milliseconds)
					claimInterval: 100,
					// Special ID. Consumers fetching data from the consumer group will only see new elements arriving in the stream.
					// https://redis.io/commands/XGROUP
					startID: "$",
					// Interval (in milliseconds) between message transfer into FAILED_MESSAGES channel
					processingAttemptsInterval: 1000
				}
			}
		});

		/**
		 * @type {Map<string,Cluster|Redis>}
		 */
		this.clients = new Map();
		this.pubName = "Pub"; // Static name of the Publish client
		this.claimName = "Claim"; // Static name of the XCLAIM client
		this.nackedName = "NACKed";

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
			Redis = require("ioredis");
			Redis.Promise = this.Promise;
		} catch (err) {
			/* istanbul ignore next */
			this.broker.fatal(
				"The 'ioredis' package is missing! Please install it with 'npm install ioredis --save' command.",
				err,
				true
			);
		}

		this.checkClientLibVersion("ioredis", "^4.27.9");
	}

	/**
	 * Connect to the adapter.
	 */
	async connect() {
		this.clients.set(this.pubName, await this.createRedisClient(this.pubName, this.opts.redis));

		this.clients.set(
			this.claimName,
			await this.createRedisClient(this.claimName, this.opts.redis)
		);

		this.clients.set(
			this.nackedName,
			await this.createRedisClient(this.nackedName, this.opts.redis)
		);

		this.connected = true;
	}

	/**
	 * Disconnect from adapter
	 */
	async disconnect() {
		this.stopping = true;

		return new Promise((resolve, reject) => {
			const checkPendingMessages = () => {
				if (this.getNumberOfTrackedChannels() === 0) {
					// Stop the publisher client
					// The subscriber clients are stopped in unsubscribe() method, which is called in serviceStopping()
					const promises = Array.from(this.clients.values()).map(client => {
						return client.disconnect();
					});

					return Promise.all(promises)
						.then(() => {
							// Release the pointers
							this.clients = new Map();
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
	}

	/**
	 * Return redis or redis.cluster client instance
	 *
	 * @param {string} name Client name
	 * @param {any} opts
	 *
	 * @memberof RedisTransporter
	 * @returns {Promise<Cluster|Redis>}
	 */
	createRedisClient(name, opts) {
		return new Promise((resolve, reject) => {
			/** @type {Cluster|Redis} */
			let client;
			if (opts && opts.cluster) {
				if (!opts.cluster.nodes || opts.cluster.nodes.length === 0) {
					throw new ServiceSchemaError("No nodes defined for cluster");
				}
				client = new Redis.Cluster(opts.cluster.nodes, opts.cluster.clusterOptions);
			} else {
				client = new Redis(opts && opts.url ? opts.url : opts);
			}

			let isConnected = false;
			client.on("connect", () => {
				this.logger.info(`Redis-Channel-Client-${name} adapter is connected.`);
				isConnected = true;
				resolve(client);
			});

			/* istanbul ignore next */
			client.on("error", err => {
				this.logger.error(`Redis-Channel-Client-${name} adapter error`, err.message);
				this.logger.debug(err);
				if (!isConnected) reject(err);
			});

			client.on("close", () => {
				this.logger.info(`Redis-Channel-Client-${name} adapter is disconnected.`);
			});
		});
	}

	/**
	 * Subscribe to a channel with a handler.
	 *
	 * @param {Channel & RedisChannel & RedisDefaultOptions} chan
	 */
	async subscribe(chan) {
		this.logger.debug(
			`Subscribing to '${chan.name}' chan with '${chan.group}' group...'`,
			chan.id
		);

		try {
			chan.redis = _.defaultsDeep({}, chan.redis, this.opts.redis.consumerOptions);

			if (chan.maxInFlight == null) chan.maxInFlight = this.opts.maxInFlight;
			if (chan.maxRetries == null) chan.maxRetries = this.opts.maxRetries;
			chan.deadLettering = _.defaultsDeep({}, chan.deadLettering, this.opts.deadLettering);
			if (chan.deadLettering.enabled) {
				chan.deadLettering.queueName = this.addPrefixTopic(chan.deadLettering.queueName);
			}

			// Create a connection for current subscription
			let chanSub = await this.createRedisClient(chan.id, this.opts.redis);
			this.clients.set(chan.id, chanSub);

			this.initChannelActiveMessages(chan.id);

			// 1. Create stream and consumer group
			try {
				// https://redis.io/commands/XGROUP
				await chanSub.xgroup(
					"CREATE",
					chan.name, // Stream name
					chan.group, // Consumer group
					chan.redis.startID, // Starting point to read messages
					`MKSTREAM` // Create stream if doesn't exist
				);
			} catch (err) {
				if (err.message.includes("BUSYGROUP")) {
					// Silently ignore the error. Channel or Consumer Group already exists
					this.logger.debug(`Consumer group '${chan.group}' already exists.`);
				} else {
					this.logger.error(
						`Unable to create the '${chan.name}' stream or consumer group '${chan.group}'.`,
						err
					);
				}
			}

			// Inspired on https://stackoverflow.com/questions/62179656/node-redis-xread-blocking-subscription
			chan.xreadgroup = async () => {
				// Adapter is stopping. Reading no longer is allowed
				if (this.stopping) return;

				if (chan.maxInFlight - this.getNumberOfChannelActiveMessages(chan.id) <= 0) {
					this.logger.debug(`MaxInFlight Limit Reached... Delaying xreadgroup`);
					return setTimeout(() => chan.xreadgroup(), 10);
				}

				this.logger.debug(`Next xreadgroup...`, chan.id);

				try {
					// this.logger.debug(`Subscription ${chan.id} is armed and waiting....`)
					// https://redis.io/commands/xreadgroup
					let message;
					try {
						message = await chanSub.xreadgroupBuffer(
							`GROUP`,
							chan.group, // Group name
							chan.id, // Consumer name
							`BLOCK`,
							chan.redis.readTimeoutInterval, // Timeout interval while waiting for messages
							`COUNT`,
							chan.maxInFlight - this.getNumberOfChannelActiveMessages(chan.id), // Max number of messages to fetch in a single read
							`STREAMS`,
							chan.name, // Channel name
							`>` //  Read messages never delivered to other consumers so far
						);
					} catch (error) {
						if (chan.unsubscribing) {
							// Caused by unsubscribe()
							return; // Exit the loop.
						} else {
							this.logger.error(error);
						}
					}

					if (message) {
						this.processMessage(chan, message);
					}
				} catch (error) {
					this.logger.error(`Error while ${chan.id} was reading messages`, error);
				}

				setTimeout(() => chan.xreadgroup(), 0);
			};

			// Initial ID. More info: https://redis.io/commands/xautoclaim
			let cursorID = "0-0";
			const claimClient = this.clients.get(this.claimName);
			chan.xclaim = async () => {
				// Service is stopping. Claiming no longer is allowed
				if (chan.unsubscribing) return;

				// xclaim is periodic. Generates too much logs
				// this.logger.debug(`Next auto claim by ${chan.id}`);

				if (chan.maxInFlight - this.getNumberOfChannelActiveMessages(chan.id) <= 0) {
					this.logger.debug(`MaxInFlight Limit Reached... Delaying xclaim`);
					return setTimeout(() => chan.xclaim(), 10);
				}

				try {
					// Claim messages that were not NACKed
					// https://redis.io/commands/xautoclaim
					let message = await claimClient.xautoclaimBuffer(
						chan.name, // Channel name
						chan.group, // Group name
						chan.id, // Consumer name,
						chan.redis.minIdleTime, // Claim messages that are pending for the specified period in milliseconds
						cursorID,
						"COUNT",
						chan.maxInFlight - this.getNumberOfChannelActiveMessages(chan.id) // Number of messages to claim at a time
					);

					if (message) {
						// Update the cursor id to be used in subsequent call
						// When there are no remaining entries, "0-0" is returned
						cursorID = message[0].toString();

						// Messages
						if (message[1].length !== 0) {
							this.metricsIncrement(C.METRIC_CHANNELS_MESSAGES_RETRIES_TOTAL, chan);
							this.logger.debug(`${chan.id} claimed ${message[1].length} messages`);
							this.processMessage(chan, [message]);
						}
					}
				} catch (error) {
					this.logger.error(`Error while claiming messages by ${chan.id}`, error);
				}

				// Next xclaim for the chan
				setTimeout(() => chan.xclaim(), chan.redis.claimInterval);
			};

			// Move NACKed messages to a dedicated channel
			const nackedClient = this.clients.get(this.nackedName);
			chan.failed_messages = async () => {
				// Service is stopping. Moving failed messages no longer is allowed
				if (chan.unsubscribing) return;

				try {
					// https://redis.io/commands/XPENDING
					let pendingMessages = await nackedClient.xpending(
						chan.name,
						chan.group,
						"-",
						"+",
						10 // Max reported entries
					);

					// Filter messages
					// Message format here: https://redis.io/commands/XPENDING#extended-form-of-xpending
					pendingMessages = pendingMessages.filter(entry => {
						return entry[3] >= chan.maxRetries;
					});

					if (pendingMessages.length != 0) {
						// Ids of the messages that will transferred into the FAILED_MESSAGES channel
						const ids = pendingMessages.map(entry => entry[0]);

						this.addChannelActiveMessages(chan.id, ids);

						// https://redis.io/commands/xclaim
						let messages = await nackedClient.xclaimBuffer(
							chan.name,
							chan.group,
							chan.id,
							0, // Min idle time
							ids
						);

						if (chan.deadLettering.enabled) {
							// Move the messages to a dedicated channel
							await Promise.all(
								messages.map(entry =>
									this.moveToDeadLetter(
										chan,
										entry[0].toString(),
										entry[1][1],
										entry[1][2] && entry[1][2].toString() === "headers"
											? this.serializer.deserialize(entry[1][3])
											: undefined
									)
								)
							);
						} else {
							this.logger.error(`Dropped ${pendingMessages.length} message(s).`, ids);
						}

						// Acknowledge the messages and break the "reject-claim" loop
						await nackedClient.xack(chan.name, chan.group, ids);

						this.removeChannelActiveMessages(chan.id, ids);
					}
				} catch (error) {
					this.logger.error(
						`Error while moving messages of ${chan.name} to ${chan.deadLettering.queueName}`,
						error
					);
				}

				setTimeout(() => chan.failed_messages(), chan.redis.processingAttemptsInterval);
			};

			// Init the failed messages loop
			chan.failed_messages();

			// Init the claim loop
			chan.xclaim();

			// Init the subscription loop
			chan.xreadgroup();
		} catch (err) {
			this.logger.error(
				`Error while subscribing to '${chan.name}' chan with '${chan.group}' group`,
				err
			);
			throw err;
		}
	}

	/**
	 * Unsubscribe from a channel.
	 *
	 * @param {Channel & RedisChannel & RedisDefaultOptions} chan
	 */
	async unsubscribe(chan) {
		if (chan.unsubscribing) return;
		chan.unsubscribing = true;

		return (
			Promise.resolve()
				.then(() => {
					// "Break" the xreadgroup() by disconnecting the client
					// Will trigger an error that has to be handled
					const client = this.clients.get(chan.id);
					if (client) client.disconnect();
				})
				// Add delay to ensure that client is disconnected
				.then(() => new Promise(resolve => setTimeout(resolve, 100)))
				.then(() => {
					return new Promise((resolve, reject) => {
						const checkPendingMessages = () => {
							if (this.getNumberOfChannelActiveMessages(chan.id) === 0) {
								this.logger.debug(
									`Unsubscribing from '${chan.name}' chan with '${chan.group}' group...'`
								);

								return Promise.resolve()
									.then(() => {
										// Unsubscribed. Delete the client and release the memory
										this.clients.delete(chan.id);

										// Stop tracking channel's active messages
										this.stopChannelActiveMessages(chan.id);
									})
									.then(() => {
										const pubClient = this.clients.get(this.pubName);
										// 1. Delete consumer from the consumer group
										// 2. Do NOT destroy the consumer group
										// https://redis.io/commands/XGROUP
										return pubClient.xgroup(
											"DELCONSUMER",
											chan.name, // Stream Name
											chan.group, // Consumer Group
											chan.id // Consumer ID
										);
									})
									.then(() => resolve())
									.catch(err => reject(err));
							} else {
								this.logger.warn(
									`Processing ${this.getNumberOfChannelActiveMessages(
										chan.id
									)} message(s) of '${chan.id}'...`
								);

								setTimeout(() => checkPendingMessages(), 1000);
							}
						};

						checkPendingMessages();
					});
				})
		);
	}

	/**
	 * Process incoming messages.
	 *
	 * @param {Channel & RedisChannel & RedisDefaultOptions} chan
	 * @param {Array<Object>} message
	 */
	async processMessage(chan, message) {
		const { ids, parsedMessages, parsedHeaders, serializedMessages } =
			this.parseMessage(message);

		this.addChannelActiveMessages(chan.id, ids);

		const promises = parsedMessages.map((entry, index) => {
			// Call the actual user defined handler
			return chan.handler(entry, {
				payload: entry,
				...(parsedHeaders[index] !== undefined
					? { headers: parsedHeaders[index] }
					: undefined)
			});
		});

		const promiseResults = await this.Promise.allSettled(promises);
		const pubClient = this.clients.get(this.pubName);

		for (let i = 0; i < promiseResults.length; i++) {
			const result = promiseResults[i];
			const id = ids[i];
			const messageHeaders = parsedHeaders[i];

			if (result.status == "fulfilled") {
				// Send ACK message
				// https://redis.io/commands/xack
				// Use pubClient to ensure that ACK is delivered to redis
				await pubClient.xack(chan.name, chan.group, id);
				this.logger.debug(`Message is ACKed.`, {
					id,
					name: chan.name,
					group: chan.group
				});
			} else {
				this.metricsIncrement(C.METRIC_CHANNELS_MESSAGES_ERRORS_TOTAL, chan);

				// Message rejected
				if (!chan.maxRetries) {
					// No retries

					if (chan.deadLettering.enabled) {
						await this.moveToDeadLetter(
							chan,
							id,
							serializedMessages[i],
							messageHeaders
						);
					} else {
						// Drop message
						this.logger.error(`Drop message...`, id);
					}
					await pubClient.xack(chan.name, chan.group, id);
				} else {
					// It will be (eventually) picked by xclaim
				}
			}
		}

		this.removeChannelActiveMessages(chan.id, ids);
	}

	/**
	 * Parse the message(s).
	 *
	 * @param {Array} messages
	 * @returns {any}
	 */
	parseMessage(messages) {
		return messages[0][1].reduce(
			(accumulator, currentVal) => {
				accumulator.ids.push(currentVal[0].toString());

				accumulator.serializedMessages.push(currentVal[1][1]);
				accumulator.parsedMessages.push(this.serializer.deserialize(currentVal[1][1]));

				accumulator.parsedHeaders.push(
					currentVal[1][2] && currentVal[1][2].toString() === "headers"
						? this.serializer.deserialize(currentVal[1][3])
						: undefined
				);

				return accumulator;
			},
			{
				ids: [], // for XACK
				parsedMessages: [], // Deserialized payload
				parsedHeaders: [], // Deserialized Headers
				serializedMessages: [] // Serialized payload
			}
		);
	}

	/**
	 * Moves message into dead letter
	 *
	 * @param {Channel & RedisChannel & RedisDefaultOptions} chan
	 * @param {String} originalID ID of the dead message
	 * @param {Object} message Raw (not serialized) message contents
	 * @param {Object} headers Header contents
	 */
	async moveToDeadLetter(chan, originalID, message, headers) {
		this.logger.debug(`Moving message to '${chan.deadLettering.queueName}'...`, originalID);

		const msgHdrs = {
			...headers,
			[HEADER_ORIGINAL_ID]: originalID,
			[C.HEADER_ORIGINAL_CHANNEL]: chan.name,
			[C.HEADER_ORIGINAL_GROUP]: chan.group
		};

		// Move the message to a dedicated channel
		const nackedClient = this.clients.get(this.nackedName);
		await nackedClient.xaddBuffer(
			chan.deadLettering.queueName,
			"*", // Auto generate the ID
			"payload",
			message, // Message contents
			"headers",
			this.serializer.serialize(msgHdrs)
		);

		this.metricsIncrement(C.METRIC_CHANNELS_MESSAGES_DEAD_LETTERING_TOTAL, chan);

		this.logger.warn(`Moved message to '${chan.deadLettering.queueName}'`, originalID);
	}

	/**
	 * Publish a payload to a channel.
	 *
	 * @param {String} channelName
	 * @param {any} payload
	 * @param {Object?} opts
	 */
	async publish(channelName, payload, opts = {}) {
		// Adapter is stopping. Publishing no longer is allowed
		if (this.stopping) return;

		if (!this.connected) {
			throw new MoleculerRetryableError("Adapter not yet connected. Skipping publishing.");
		}

		this.logger.debug(`Publish a message to '${channelName}' channel...`, payload, opts);

		const clientPub = this.clients.get(this.pubName);

		try {
			let args = [
				channelName, // Stream name
				"*", // Auto ID
				"payload", // Entry
				opts.raw ? payload : this.serializer.serialize(payload) // Actual payload
			];

			// Add headers
			if (opts.headers) {
				args.push(...["headers", this.serializer.serialize(opts.headers)]);
			}

			// https://redis.io/commands/XADD
			const id = await clientPub.xaddBuffer(...args);

			this.logger.debug(`Message ${id} was published at '${channelName}'`);
		} catch (err) {
			this.logger.error(`Cannot publish to '${channelName}'`, err);
			throw err;
		}
	}
}

module.exports = RedisAdapter;
