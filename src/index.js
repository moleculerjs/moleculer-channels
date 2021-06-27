/*
 * @moleculer/channels
 * Copyright (c) 2021 MoleculerJS (https://github.com/moleculerjs/channels)
 * MIT Licensed
 */

"use strict";

const _ = require("lodash");
const { BrokerOptionsError } = require("moleculer").Errors;
const Adapters = require("./adapters");

module.exports = function ChannelsMiddleware(mwOpts) {
	mwOpts = _.defaultsDeep(mwOpts, {});
	let logger;
	let adapter;

	return {
		name: "Channels",

		/**
		 * Create lifecycle hook of service
		 */
		created(broker) {
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
		 */
		async serviceCreated(svc) {
			if (_.isPlainObject(svc.schema.channels)) {
				logger.debug(
					`Processing channels of '${svc.fullName}' service...`,
					svc.schema.channels
				);
				// TODO: Process `channels` in the schema
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
