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
	 * @param {Service} service
	 */
	init(service) {
		this.service = service;
		this.logger = service.logger;
		this.broker = service.broker;
		this.Promise = this.broker.Promise;
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

}

module.exports = BaseAdapter;
