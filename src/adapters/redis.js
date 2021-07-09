/*
 * @moleculer/channels
 * Copyright (c) 2021 MoleculerJS (https://github.com/moleculerjs/channels)
 * MIT Licensed
 */

"use strict";

const _ = require("lodash");
const BaseAdapter = require("./base");
const { ServiceSchemaError } = require("moleculer").Errors;
const { Serializers } = require("moleculer");

let Redis;

/**
 * Type defs to add some IntelliSense
 * @typedef {import("ioredis").Cluster} Cluster
 * @typedef {import("ioredis").Redis} Redis
 * @typedef {import("moleculer").ServiceBroker} ServiceBroker
 * @typedef {import("moleculer").LoggerInstance} Logger
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
		if (_.isString(opts)) opts = { redis: opts };

		super(opts);

		this.opts = _.defaultsDeep(this.opts, {
			serializer: "JSON"
		});

		this.clientSub = null;
		this.clientPub = null;

		// Tracks the messages that are still being processed
		this.activeMessages = [];

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

		this.checkClientLibVersion("ioredis", "^4.27.6");

		// create an instance of serializer (default to JSON)
		this.serializer = Serializers.resolve(this.opts.serializer);
		this.serializer.init(this.broker);
		this.logger.info("Channel serializer:", this.broker.getConstructorName(this.serializer));
	}

	/**
	 * Connect to the adapter.
	 */
	async connect() {
		this.clientSub = await this.createRedisClient("Sub", this.opts.redis);
		this.clientPub = await this.createRedisClient("Pub", this.opts.redis);
	}

	/**
	 * Disconnect from adapter
	 */
	async disconnect() {
		this.stopping = true;

		return new Promise((resolve, reject) => {
			const checkPendingMessages = () => {
				if (this.activeMessages.length === 0) {
					return Promise.resolve()
						.then(() => {
							if (this.clientSub) {
								return this.clientSub.disconnect();
							}
						})
						.then(() => {
							if (this.clientPub) {
								return this.clientPub.disconnect();
							}
						})
						.then(() => {
							this.clientSub = null;
							this.clientPub = null;

							resolve();
						})
						.catch(err => reject(err));
				} else {
					this.logger.warn(`Processing ${this.activeMessages.length} message(s)...`);

					setTimeout(checkPendingMessages, 100);
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
	 * @returns {Promise<Cluster|Redis>)}
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
				client = new Redis(opts);
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
				this.logger.warn(`Redis-Channel-Client-${name} adapter is disconnected.`);
			});
		});
	}

	/**
	 * Subscribe to a channel with a handler.
	 *
	 * @param {Channel} chan
	 */
	async subscribe(chan) {
		this.logger.debug(`Subscribing to '${chan.name}' chan with '${chan.group}' group...'`);

		// 1. Create stream and consumer group
		try {
			// https://redis.io/commands/XGROUP
			await this.clientPub.xgroup(
				"CREATE",
				chan.name, // Stream name
				chan.group, // Consumer group
				`$`, // Only the latest data
				`MKSTREAM` // Create stream if doesn't exist
			);
		} catch (err) {
			if (err.message.includes("BUSYGROUP")) {
				// Silently ignore the error. Channel or Consumer Group already exists
				this.logger.debug(`Consumer group '${chan.group}' is exist.`);
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

			try {
				// this.logger.debug(`Subscription ${chan.id} is armed and waiting....`)
				// https://redis.io/commands/xreadgroup
				const message = await this.clientSub.xreadgroup(
					`GROUP`,
					chan.group, // Group name
					chan.id, // Consumer name
					`BLOCK`,
					0, // Never timeout while waiting for messages
					`COUNT`,
					chan.maxInFlight || 1, // Max number of messages to receive in a single read
					`STREAMS`,
					chan.name, // Channel name
					`>` //  Read messages never delivered to other consumers so far
				);

				if (message) {
					const { ids, parsedMessages } = this.parseMessage(message);

					this.addActiveMessages(ids);

					const promises = parsedMessages.map(entry => {
						// Call the actual user defined handler
						return chan.handler(entry);
					});

					const promiseResults = await Promise.allSettled(promises);

					for (const result of promiseResults) {
						if (result.status == "fulfilled") {
							// Send ACK message
							// https://redis.io/commands/xack
							await this.clientPub.xack(chan.name, chan.group, ids);
							this.logger.debug(`Message(s) ${ids} is ACKed`);
						}

						this.removeActiveMessages(ids);
					}
				}
			} catch (error) {
				this.logger.error(error);
			}

			setTimeout(() => chan.xreadgroup(), 0);
		};

		// Init the subscription loop
		chan.xreadgroup();
	}

	/**
	 * Add IDs of the messages that are currently being processed
	 *
	 * @param {Array} ids List of IDs
	 */
	addActiveMessages(ids) {
		this.activeMessages.push(...ids);
	}

	/**
	 * Remove IDs of the messages that are were already processed
	 *
	 * @param {Array} ids List of IDs
	 */
	removeActiveMessages(ids) {
		ids.forEach(id => {
			let idx = this.activeMessages.indexOf(id);
			if (idx != -1) {
				this.activeMessages.splice(idx, 1);
			}
		});
	}

	/**
	 * Parse the message(s)
	 * @param {Array} messages
	 * @returns {Array}
	 */
	parseMessage(messages) {
		return messages[0][1].reduce(
			(accumulator, currentVal) => {
				accumulator.ids.push(currentVal[0]);
				accumulator.parsedMessages.push(this.serializer.deserialize(currentVal[1][1]));

				return accumulator;
			},
			{
				ids: [], // for XACK
				parsedMessages: []
			}
		);
	}

	/**
	 * Unsubscribe from a channel.
	 *
	 * @param {Channel} chan
	 */
	async unsubscribe(chan) {
		this.logger.debug(`Unsubscribing to '${chan.name}' chan with '${chan.group}' group...'`);

		// 1. Delete consumer from the consumer group
		// 2. Do NOT destroy the consumer group
		// https://redis.io/commands/XGROUP
		await this.clientPub.xgroup(
			"DELCONSUMER",
			chan.name, // Stream Name
			chan.group, // Consumer Group
			chan.id // Consumer ID
		);
	}

	/**
	 * Publish a payload to a channel.
	 * @param {String} channelName
	 * @param {any} payload
	 * @param {Object?} opts
	 */
	async publish(channelName, payload, opts = {}) {
		this.logger.debug(`Publish a message to '${channelName}' channel...`, payload, opts);

		try {
			// https://redis.io/commands/XADD
			const id = await this.clientPub.xadd(
				channelName, // Stream name
				"*", // Auto ID
				"payload", // Entry
				this.serializer.serialize(payload) // Actual payload
			);
			this.logger.debug(`Message ${id} was published at ${channelName}`);
		} catch (error) {
			this.logger.error(`Cannot publish to '${channelName}'`, error);
		}
	}
}

module.exports = RedisAdapter;
