/*
 * @moleculer/channels
 * Copyright (c) 2021 MoleculerJS (https://github.com/moleculerjs/channels)
 * MIT Licensed
 */

"use strict";

const semver = require("semver");

class BaseAdapter {
	/**
	 * Constructor of adapter
	 * @param  {Object?} opts
	 */
	constructor(opts) {
		this.opts = opts || {};
	}

	/**
	 * Initialize the adapter.
	 *
	 * @param {ServiceBroker} broker
	 * @param {Logger} logger
	 */
	init(broker, logger) {
		this.broker = broker;
		this.logger = logger;
		this.Promise = broker.Promise;

		if (!this.opts.consumerName) this.opts.consumerName = this.broker.nodeID;
	}

	/**
	 * Check the installed client library version.
	 * https://github.com/npm/node-semver#usage
	 *
	 * @param {String} installedVersion
	 * @param {String} requiredVersions
	 * @returns {Boolean}
	 */
	checkClientLibVersion(library, requiredVersions) {
		const pkg = require(`${library}/package.json`);
		const installedVersion = pkg.version;

		if (semver.satisfies(installedVersion, requiredVersions)) {
			return true;
		} else {
			this.logger.warn(
				`The installed ${library} library is not supported officially. Proper functionality cannot be guaranteed. Supported versions:`,
				requiredVersions
			);
			return false;
		}
	}

	/**
	 * Connect to the adapter.
	 */
	async connect() {
		/* istanbul ignore next */
		throw new Error("This method is not implemented.");
	}

	/**
	 * Disconnect from adapter
	 */
	async disconnect() {
		/* istanbul ignore next */
		throw new Error("This method is not implemented.");
	}

	/**
	 * Subscribe to a channel.
	 *
	 * @param {Channel} chan
	 */
	async subscribe(chan) {
		/* istanbul ignore next */
		throw new Error("This method is not implemented.");
	}

	/**
	 * Unsubscribe from a channel.
	 *
	 * @param {Channel} chan
	 */
	async unsubscribe(chan) {
		/* istanbul ignore next */
		throw new Error("This method is not implemented.");
	}

	/**
	 * Publish a payload to a channel.
	 * @param {String} channelName
	 * @param {any} payload
	 * @param {Object?} opts
	 */
	async publish(channelName, payload, opts) {
		/* istanbul ignore next */
		throw new Error("This method is not implemented.");
	}
}

module.exports = BaseAdapter;
