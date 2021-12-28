/*
 * @moleculer/channels
 * Copyright (c) 2021 MoleculerJS (https://github.com/moleculerjs/channels)
 * MIT Licensed
 */

"use strict";

const _ = require("lodash");
const semver = require("semver");
const { MoleculerError } = require("moleculer").Errors;
const { Serializers, METRIC } = require("moleculer");
const C = require("../constants");

/**
 * @typedef {import("moleculer").ServiceBroker} ServiceBroker Moleculer Service Broker instance
 * @typedef {import("moleculer").LoggerInstance} Logger Logger instance
 * @typedef {import("moleculer").Serializer} Serializer Moleculer Serializer
 * @typedef {import("../index").Channel} Channel Base channel definition
 * @typedef {import("../index").DeadLetteringOptions} DeadLetteringOptions Dead-letter-queue options
 */

/**
 * @typedef {Object} BaseDefaultOptions Base Adapter configuration
 * @property {String?} prefix Adapter prefix
 * @property {String} consumerName Name of the consumer
 * @property {String} serializer Type of serializer to use in message exchange. Defaults to JSON
 * @property {Number} maxRetries Maximum number of retries before sending the message to dead-letter-queue or drop
 * @property {Number} maxInFlight Maximum number of messages that can be processed in parallel.
 * @property {DeadLetteringOptions} deadLettering Dead-letter-queue options
 */

class BaseAdapter {
	/**
	 * Constructor of adapter
	 * @param  {Object?} opts
	 */
	constructor(opts) {
		/** @type {BaseDefaultOptions} */
		this.opts = _.defaultsDeep({}, opts, {
			consumerName: null,
			prefix: null,
			serializer: "JSON",
			maxRetries: 3,
			maxInFlight: 1,
			deadLettering: {
				enabled: false,
				queueName: "FAILED_MESSAGES"
			}
		});

		/**
		 * Tracks the messages that are still being processed by different clients
		 * @type {Map<string, Array<string|number>>}
		 */
		this.activeMessages = new Map();

		/** @type {Boolean} Flag indicating the adapter's connection status */
		this.connected = false;
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

		this.logger.info("Channel consumer name:", this.opts.consumerName);
		this.logger.info("Channel prefix:", this.opts.prefix);

		// create an instance of serializer (default to JSON)
		/** @type {Serializer} */
		this.serializer = Serializers.resolve(this.opts.serializer);
		this.serializer.init(this.broker);
		this.logger.info("Channel serializer:", this.broker.getConstructorName(this.serializer));

		this.registerAdapterMetrics(broker);
	}

	/**
	 * Register adapter related metrics
	 * @param {ServiceBroker} broker
	 */
	registerAdapterMetrics(broker) {
		if (!broker.isMetricsEnabled()) return;

		broker.metrics.register({
			type: METRIC.TYPE_COUNTER,
			name: C.METRIC_CHANNELS_MESSAGES_ERRORS_TOTAL,
			labelNames: ["channel", "group"],
			rate: true,
			unit: "msg"
		});

		broker.metrics.register({
			type: METRIC.TYPE_COUNTER,
			name: C.METRIC_CHANNELS_MESSAGES_RETRIES_TOTAL,
			labelNames: ["channel", "group"],
			rate: true,
			unit: "msg"
		});

		broker.metrics.register({
			type: METRIC.TYPE_COUNTER,
			name: C.METRIC_CHANNELS_MESSAGES_DEAD_LETTERING_TOTAL,
			labelNames: ["channel", "group"],
			rate: true,
			unit: "msg"
		});
	}

	/**
	 *
	 * @param {String} metricName
	 * @param {Channel} chan
	 */
	metricsIncrement(metricName, chan) {
		if (!this.broker.isMetricsEnabled()) return;

		this.broker.metrics.increment(metricName, {
			channel: chan.name,
			group: chan.group
		});
	}

	/**
	 * Check the installed client library version.
	 * https://github.com/npm/node-semver#usage
	 *
	 * @param {String} library
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
	 * @param {Array<string|number>} IDs List of IDs
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
	 * @param {string[]|number[]} IDs List of IDs
	 */
	removeChannelActiveMessages(channelID, IDs) {
		if (!this.activeMessages.has(channelID)) {
			throw new MoleculerError(`Not tracking active messages of channel ${channelID}`);
		}

		const messageList = this.activeMessages.get(channelID);

		IDs.forEach(id => {
			const idx = messageList.indexOf(id);
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
			//throw new MoleculerError(`Not tracking active messages of channel ${channelID}`);
			return 0;
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
	 * Given a topic name adds the prefix
	 *
	 * @param {String} topicName
	 * @returns {String} New topic name
	 */
	addPrefixTopic(topicName) {
		if (this.opts.prefix != null && this.opts.prefix != "" && topicName) {
			return `${this.opts.prefix}.${topicName}`;
		}

		return topicName;
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
