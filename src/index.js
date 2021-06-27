/*
 * @moleculer/channels
 * Copyright (c) 2021 MoleculerJS (https://github.com/moleculerjs/channels)
 * MIT Licensed
 */

"use strict";

const _ = require("lodash");
const { BrokerOptionsError, ServiceSchemaError } = require("moleculer").Errors;
const Adapters = require("./adapters");

/**
 * Type defs to add some IntelliSense
 * @typedef {import("moleculer").ServiceBroker} ServiceBroker
 * @typedef {import("moleculer").Service} Service
 * @typedef {import("./adapters/").Base} BaseAdapter
 */

module.exports = function ChannelsMiddleware(mwOpts) {
	mwOpts = _.defaultsDeep(mwOpts, {});
	let broker;
	let logger;
	let adapter;

	return {
		name: "Channels",

		/**
		 * Create lifecycle hook of service
		 */
		created(_broker) {
			broker = _broker;
			logger = broker.getLogger("Channels");

			// Create adapter
			if (!mwOpts.adapter)
				throw new BrokerOptionsError("Channel adapter must be defined.", { opts: mwOpts });

			adapter = Adapters.resolve(mwOpts.adapter);
			adapter.init(broker, logger);

			// Populate broker with new methods
			if (!broker.sendToChannel) {
				broker.sendToChannel = (channelName, payload, opts) => {
					return adapter.publish(channelName, payload, opts);
				};
			}
		},

		/**
		 * Created lifecycle hook of service
		 *
		 * @param {Service} svc
		 */
		async serviceCreated(svc) {
			if (_.isPlainObject(svc.schema.channels)) {
				logger.debug(
					`Subscribe to channels of '${svc.fullName}' service...`,
					svc.schema.channels
				);

				svc.$channels = {};
				// Process `channels` in the schema
				await Promise.mapSeries(
					Object.entries(svc.schema.channels),
					async ([name, def]) => {
						let chan;

						if (_.isFunction(def)) {
							chan = {
								handler: def
							};
						} else if (_.isPlainObject(def)) {
							chan = _.cloneDeep(def);
						} else {
							throw new ServiceSchemaError(
								`Invalid channel definition in '${name}' channel in '${svc.fullName}' service!`
							);
						}

						if (!_.isFunction(chan.handler)) {
							throw new ServiceSchemaError(
								`Missing channel handler on '${name}' channel in '${svc.fullName}' service!`
							);
						}

						if (!chan.name) chan.name = name;
						if (!chan.group) chan.group = svc.fullName;

						// Wrap the original handler
						let handler = chan.handler;
						chan.handler = broker.Promise.method(handler).bind(svc);

						svc.$channels[name] = chan;

						await adapter.subscribe(chan);
					}
				);
			}
		},

		/**
		 * Service stopping lifecycle hook.
		 * Need to unsubscribe from the channels.
		 *
		 * @param {Service} svc
		 */
		async serviceStopping(svc) {
			if (svc.$channels) {
				logger.debug(
					`Unsubscribe from channels of '${svc.fullName}' service...`,
					svc.schema.channels
				);

				// Unsubscribe from `channels`
				await Promise.mapSeries(Object.values(svc.$channels), async chan => {
					await adapter.unsubscribe(chan);
				});
			}
		},

		/**
		 * Start lifecycle hook of service
		 */
		async started() {
			logger.info("Connecting channel adapter...");
			await adapter.connect();
			logger.debug("Channel adapter connected.");
		},

		/**
		 * Stop lifecycle hook of service
		 */
		async stopped() {
			logger.info("Disconnecting channel adapter...");
			await adapter.disconnect();
			logger.debug("Channel adapter disconnected.");
		}
	};
};
