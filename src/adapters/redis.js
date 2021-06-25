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
	 * @param {Service} service
	 */
	init(service) {
		super.init(service);

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
		this.client = this.getRedisClient(this.opts.redis);

		this.client.on("connect", () => {
			this.logger.info("Redis adapter is connected.");
		});

		/* istanbul ignore next */
		this.client.on("error", err => {
			this.logger.error("Redis adapter error", err.message);
			this.logger.debug(err);
		});

		this.client.on("close", () => {
			this.logger.warn("Redis adapter is disconnected.");
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
}

module.exports = RedisAdapter;
