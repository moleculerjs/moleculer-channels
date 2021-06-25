/*
 * @moleculer/channels
 * Copyright (c) 2021 MoleculerJS (https://github.com/moleculerjs/channels)
 * MIT Licensed
 */

"use strict";

const _ = require("lodash");

module.exports = function ChannelsMiddleware(mwOpts) {
	mwOpts = _.defaultsDeep(mwOpts, {});
	let logger;

	return {
		name: "Channels",

		/**
		 * Create lifecycle hook of service
		 */
		created(broker) {
			logger = broker.getLogger("Channels");
			// TODO: Populate broker with new methods
		},

		/**
		 * Created lifecycle hook of service
		 */
		async serviceCreated(svc) {
			if (_.isPlainObject(svc.schema.channels)) {
				logger.info(
					`Processing channels of '${svc.fullName}' service...`,
					svc.schema.channels
				);
				// TODO: Process `channels` in the schema
				// TODO: collect custom adapters
			}
		},

		/**
		 * Start lifecycle hook of service
		 */
		async started() {
			// TODO: connect adapters
		},

		/**
		 * Stop lifecycle hook of service
		 */
		async stopped() {
			// TODO: Disconnect adapters
		}
	};
};
