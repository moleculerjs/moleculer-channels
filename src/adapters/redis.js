/*
 * @moleculer/channels
 * Copyright (c) 2021 MoleculerJS (https://github.com/moleculerjs/channels)
 * MIT Licensed
 */

"use strict";

const _ = require("lodash");
const BaseAdapter = require("./base");
const { ServiceSchemaError } = require("moleculer").Errors;

let Redis;

/**
 * Type defs to add some IntelliSense
 * @typedef {import("ioredis").Cluster} Cluster
 * @typedef {import("ioredis").Redis} Redis
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

		this.client = null;
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
	}

	/**
	 * Connect to the adapter.
	 */
	async connect() {
		return new Promise((resolve, reject) => {
			let isConnected = false;
			this.client = this.getRedisClient(this.opts.redis);

			this.client.on("connect", () => {
				this.logger.info("Redis adapter is connected.");
				isConnected = true;
				resolve();
			});

			/* istanbul ignore next */
			this.client.on("error", err => {
				this.logger.error("Redis adapter error", err.message);
				this.logger.debug(err);
				if (!isConnected) reject(err);
			});

			this.client.on("close", () => {
				this.logger.warn("Redis adapter is disconnected.");
			});
		});
	}

	/**
	 * Disconnect from adapter
	 */
	async disconnect() {
		if (this.client) {
			await this.client.disconnect();
			this.client = null;
		}
	}

	/**
	 * Return redis or redis.cluster client
	 *
	 * @param {any} opts
	 *
	 * @memberof RedisTransporter
	 */
	getRedisClient(opts) {
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
		return client;
	}

	/**
	 * Subscribe to a channel with a handler.
	 *
	 * @param {Channel} chan
	 */
	async subscribe(chan) {
		// https://stackoverflow.com/questions/62179656/node-redis-xread-blocking-subscription
		// https://github.com/NodeRedis/node-redis/issues/1394
		// https://github.com/luin/ioredis/issues/747

		// TODO
		this.logger.info("TODO: subscribe", chan);

		// 1. Create stream and consumer group
		// XGROUP CREATE newstream mygroup $ MKSTREAM
		try {
			await this.client.xgroup(
				"CREATE",
				`${chan.name}`, // Stream name
				`${chan.group}`, // Consumer group
				`$`, // only the latest data
				`MKSTREAM` // Create stream if doesn't exist
			);
		} catch (error) {
			// Silently ignore the error. Channel or Consumer Group already exists
			// this.logger.error(error)
		}

		chan.xreadgroup = async () => {
			// console.log(`${consumerName} is armed`)
			const message = await this.client.xreadgroup(
				`GROUP`,
				`${chan.group}`, // Group name
				`${Math.round(Math.random() * 1000)}`, // Consumer name. Auto-generated
				`BLOCK`,
				`0`, // Never timeout while waiting the message
				`COUNT`,
				`1`, // Max number of messages to receive in single read
				`STREAMS`,
				`${chan.name}`, // Channel name
				`>` //  Read messages never delivered to other consumers so far
			);

			const result = this.parseMessage(message);

			await chan.handler(result);

			setTimeout(() => chan.xreadgroup(), 0);
		};

		// Init the subscription loop
		chan.xreadgroup();
		

		/* If a new message received
			try {
				await chan.handler(msg.payload);
				await msg.ack();
			} catch(err) {
				this.logger.error(`Channel '${chan.name}' handler error`, err);
				await msg.nack();
			}
		*/
	}

	/**
	 * Parse the message(s)
	 * @param {Array} messages 
	 * @returns {Array}
	 */
	parseMessage(messages) {
		// ToDo: Improve parsing
		let result = messages[0][1].map(entry => {
			return { id: entry[0], message: JSON.parse(entry[1][1]) };
		});

		return result;
	}

	/**
	 * Unsubscribe from a channel.
	 *
	 * @param {Channel} chan
	 */
	async unsubscribe(chan) {
		// TODO
		this.logger.info("TODO: unsubscribe", chan);

		// 1. Delete consumer from the consumer group
		// 2. Do NOT destroy the consumer group
		// XGROUP DELCONSUMER mystream consumer-group-name myconsumer123
	}

	/**
	 * Publish a payload to a channel.
	 * @param {String} channelName
	 * @param {any} payload
	 * @param {Object?} opts
	 */
	async publish(channelName, payload, opts = {}) {
		// TODO
		this.logger.info(`TODO: publish a '${channelName}' message...`, payload, opts);

		try {
			// https://redis.io/commands/XADD
			const id = await this.client.xadd(
				channelName, // Stream name
				"*", // Auto ID
				"payload", // Entry
				JSON.stringify(payload) // Actual payload
			);
			this.logger.debug(`Message ${id} was published at ${channelName}`);
		} catch (error) {
			this.logger.error(`Cannot publish to '${channelName}'`, error);
		}
	}
}

module.exports = RedisAdapter;
