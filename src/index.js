/*
 * @moleculer/channels
 * Copyright (c) 2021 MoleculerJS (https://github.com/moleculerjs/channels)
 * MIT Licensed
 */

"use strict";

const _ = require("lodash");
const pkg = require("../package.json");

module.exports = function DatabaseMixin(mixinOpts) {
	mixinOpts = _.defaultsDeep(mixinOpts, {});

	const schema = {
		// Must overwrite it
		name: "",

		/**
		 * Metadata
		 */
		// Service's metadata
		metadata: {
			$category: "messages",
			$description: "Reliable messages for Moleculer services",
			$official: true,
			$package: {
				name: pkg.name,
				version: pkg.version,
				repo: pkg.repository ? pkg.repository.url : null
			}
		},

		/**
		 * Default settings
		 */
		settings: {},

		/**
		 * Actions
		 */
		actions: {},

		/**
		 * Methods
		 */
		methods: {},

		/**
		 * Create lifecycle hook of service
		 */
		created(broker) {
			// TODO: Populate broker with new methods
			broker.logger.info("Hello");
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
		},

		/**
		 * It is called when the Service schema mixins are merged. At this
		 * point, we read channel schemas and make the subscriptions.
		 *
		 * @param {Object} schema
		 */
		merged(schema) {
			// TODO: Process `channels` in the schema
		}
	};

	return schema;
};
