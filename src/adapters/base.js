/*
 * @moleculer/channels
 * Copyright (c) 2021 MoleculerJS (https://github.com/moleculerjs/channels)
 * MIT Licensed
 */

"use strict";

const _ = require("lodash");
const semver = require("semver");
const { MoleculerError } = require("moleculer").Errors;
const { Serializers } = require("moleculer");

/**
 * Type defs to add some IntelliSense
 * @typedef {import("moleculer").ServiceBroker} ServiceBroker
 * @typedef {import("moleculer").LoggerInstance} Logger
 */

class BaseAdapter {
	/**
	 * Constructor of adapter
	 * @param  {Object?} opts
	 */
	constructor(opts) {
		this.opts = _.defaultsDeep({ prefix: null }, opts);

		/**
		 * Tracks the messages that are still being processed by different clients
		 * @type {Map<string, string[]>}
		 */
		this.activeMessages = new Map();
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
		if (this.opts.prefix == null) this.opts.prefix = broker.namespace;

		// create an instance of serializer (default to JSON)
		this.serializer = Serializers.resolve(this.opts.serializer);
		this.serializer.init(this.broker);
		this.logger.info("Channel serializer:", this.broker.getConstructorName(this.serializer));
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
	 * Init active messages list for tracking messages of a channel
	 * @param {string} channelID
	 */
	initChannelActiveMessages(channelID) {
		if (this.activeMessages.has(channelID)) {
			throw new MoleculerError(`Already tracking active messages of channel ${channelID}`);
		}

		this.activeMessages.set(channelID, []);
	}

	/**
	 * Remove active messages list of a channel
	 * @param {string} channelID
	 */
	stopChannelActiveMessages(channelID) {
		if (!this.activeMessages.has(channelID)) {
			throw new MoleculerError(`Not tracking active messages of channel ${channelID}`);
		}

		if (this.activeMessages.get(channelID).length !== 0) {
			throw new MoleculerError(
				`Can't stop tracking active messages of channel ${channelID}. It still has ${
					this.activeMessages.get(channelID).length
				} messages being processed.`
			);
		}

		this.activeMessages.delete(channelID);
	}

	/**
	 * Add IDs of the messages that are currently being processed
	 *
	 * @param {string} channelID Channel ID
	 * @param {string[]} IDs List of IDs
	 */
	addChannelActiveMessages(channelID, IDs) {
		if (!this.activeMessages.has(channelID)) {
			throw new MoleculerError(`Not tracking active messages of channel ${channelID}`);
		}

		this.activeMessages.get(channelID).push(...IDs);
	}

	/**
	 * Remove IDs of the messages that were already processed
	 *
	 * @param {string} channelID Channel ID
	 * @param {string[]} IDs List of IDs
	 */
	removeChannelActiveMessages(channelID, IDs) {
		if (!this.activeMessages.has(channelID)) {
			throw new MoleculerError(`Not tracking active messages of channel ${channelID}`);
		}

		const messageList = this.activeMessages.get(channelID);

		IDs.forEach(id => {
			let idx = messageList.indexOf(id);
			if (idx != -1) {
				messageList.splice(idx, 1);
			}
		});
	}

	/**
	 * Get the number of active messages of a channel
	 *
	 * @param {string} channelID Channel ID
	 */
	getNumberOfChannelActiveMessages(channelID) {
		if (!this.activeMessages.has(channelID)) {
			throw new MoleculerError(`Not tracking active messages of channel ${channelID}`);
		}

		return this.activeMessages.get(channelID).length;
	}

	/**
	 * Get the number of channels
	 */
	getNumberOfTrackedChannels() {
		return this.activeMessages.size;
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
