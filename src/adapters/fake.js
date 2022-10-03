/*
 * @moleculer/channels
 * Copyright (c) 2021 MoleculerJS (https://github.com/moleculerjs/channels)
 * MIT Licensed
 */

"use strict";

const _ = require("lodash");
const BaseAdapter = require("./base");
const C = require("../constants");

/**
 * @typedef {import("moleculer").ServiceBroker} ServiceBroker Moleculer Service Broker instance
 * @typedef {import("moleculer").Context} Context Context instance
 * @typedef {import("moleculer").Service} Service Service instance
 * @typedef {import("moleculer").LoggerInstance} Logger Logger instance
 * @typedef {import("../index").Channel} Channel Base channel definition
 * @typedef {import("./base").BaseDefaultOptions} BaseDefaultOptions Base adapter options
 */

/**
 * @typedef {Object} FakeOptions Fake Adapter configuration
 * @property {Number} servicePrefix Prefix for service names
 * @property {Number} eventPrefix Prefix for event names
 */

/**
 * Fake (Moleculer Event-based) adapter
 *
 * @class FakeAdapter
 * @extends {BaseAdapter}
 */
class FakeAdapter extends BaseAdapter {
	/**
	 * Constructor of adapter.
	 *
	 * @param  {Object?} opts
	 */
	constructor(opts) {
		if (_.isString(opts)) opts = {};

		super(opts);

		/** @type {FakeOptions & BaseDefaultOptions} */
		this.opts = _.defaultsDeep(this.opts, {
			servicePrefix: "$channel",
			eventPrefix: "channels"
		});

		this.services = new Map();

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
	}

	/**
	 * Connect to the adapter.
	 */
	async connect() {
		this.connected = true;
	}

	/**
	 * Disconnect from adapter
	 */
	async disconnect() {
		this.connected = false;
	}

	/**
	 * Subscribe to a channel with a handler.
	 *
	 * @param {Channel} chan
	 * @param {Service} svc
	 */
	async subscribe(chan, svc) {
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
			}

			const schema = {
				name:
					this.opts.servicePrefix +
					":" +
					svc.fullName +
					":" +
					chan.name +
					":" +
					chan.group,
				events: {
					[this.opts.eventPrefix + "." + chan.name]: {
						bulkhead:
							chan.maxInFlight != null
								? {
										enabled: true,
										concurrency: chan.maxInFlight
								  }
								: undefined,
						group: chan.group,
						handler: ctx => this.processMessage(chan, ctx)
					}
				}
			};

			// Create a handler service
			const service = this.broker.createService(schema);
			this.services.set(chan.id, service);
			this.initChannelActiveMessages(chan.id);
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
	 * @param {Channel} chan
	 */
	async unsubscribe(chan) {
		if (chan.unsubscribing) return;
		chan.unsubscribing = true;

		this.logger.debug(`Unsubscribing from '${chan.name}' chan with '${chan.group}' group...'`);

		const service = this.services.get(chan.id);
		if (service) {
			await this.broker.destroyService(service);
			this.stopChannelActiveMessages(chan.id);
		}
	}

	/**
	 * Process incoming messages.
	 *
	 * @param {Channel} chan
	 * @param {Context} ctx
	 */
	async processMessage(chan, ctx) {
		const { payload } = ctx.params;
		const id = ctx.id;

		try {
			this.addChannelActiveMessages(chan.id, [id]);
			await chan.handler(payload, ctx.params);
			// TODO: acking?
			this.removeChannelActiveMessages(chan.id, [id]);
		} catch (err) {
			this.logger.error(`Error while processing message`, err);
			this.removeChannelActiveMessages(chan.id, [id]);

			this.metricsIncrement(C.METRIC_CHANNELS_MESSAGES_ERRORS_TOTAL, chan);

			// TODO: retrying & dead letter?
			throw err;
		}
	}

	/**
	 * Publish a payload to a channel.
	 *
	 * @param {String} channelName
	 * @param {any} payload
	 * @param {Object?} opts
	 */
	async publish(channelName, payload, opts = {}) {
		this.logger.debug(`Publish a message to '${channelName}' channel...`, payload, opts);

		this.broker.emit(
			this.opts.eventPrefix + "." + channelName,
			{ payload, headers: opts.headers },
			{}
		);
	}
}

module.exports = FakeAdapter;
