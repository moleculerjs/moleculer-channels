/*
 * @moleculer/channels
 * Copyright (c) 2021 MoleculerJS (https://github.com/moleculerjs/channels)
 * MIT Licensed
 */

"use strict";

const { isObject, isString } = require("lodash");
const { ServiceSchemaError } = require("moleculer").Errors;

const Adapters = {
	Base: require("./base"),
	AMQP: require("./amqp"),
	Kafka: require("./kafka"),
	Redis: require("./redis")
};

function getByName(name) {
	if (!name) return null;

	let n = Object.keys(Adapters).find(n => n.toLowerCase() == name.toLowerCase());
	if (n) return Adapters[n];
}

/**
 * Resolve adapter by name
 *
 * @param {object|string} opt
 * @returns {Adapter}
 */
function resolve(opt) {
	if (opt instanceof Adapters.Base) {
		return opt;
	} else if (isString(opt)) {
		const AdapterClass = getByName(opt);
		if (AdapterClass) {
			return new AdapterClass();
		} else if (opt.startsWith("redis://") || opt.startsWith("rediss://")) {
			return new Adapters.Redis(opt);
		} else if (opt.startsWith("amqp://") || opt.startsWith("amqps://")) {
			return new Adapters.AMQP(opt);
		} else if (opt.startsWith("kafka://")) {
			return new Adapters.Kafka(opt);
		} else {
			throw new ServiceSchemaError(`Invalid Adapter type '${opt}'.`, { type: opt });
		}
	} else if (isObject(opt)) {
		const AdapterClass = getByName(opt.type || "Redis");
		if (AdapterClass) {
			return new AdapterClass(opt.options);
		} else {
			throw new ServiceSchemaError(`Invalid Adapter type '${opt.type}'.`, {
				type: opt.type
			});
		}
	}

	return new Adapters.Redis();
}

function register(name, value) {
	Adapters[name] = value;
}

module.exports = Object.assign(Adapters, { resolve, register });
