/*
 * @moleculer/channels
 * Copyright (c) 2023 MoleculerJS (https://github.com/moleculerjs/channels)
 * MIT Licensed
 */

"use strict";

const _ = require("lodash");
const { isFunction, isPlainObject, safetyObject } = require("moleculer").Utils;

module.exports = function TracingMiddleware() {
	let broker, tracer;

	function tracingLocalChannelMiddleware(handler, chan) {
		let opts = chan.tracing;
		if (opts === true || opts === false) opts = { enabled: !!opts };
		opts = _.defaultsDeep({}, opts, { enabled: true });

		if (broker.isTracingEnabled() && opts.enabled) {
			return function tracingLocalChannelMiddleware(ctx, ...rest) {
				ctx.requestID = ctx.requestID || tracer.getCurrentTraceID();
				ctx.parentID = ctx.parentID || tracer.getActiveSpanID();

				let tags = {
					callingLevel: ctx.level,
					chan: {
						name: chan.name,
						group: chan.group
					},
					remoteCall: ctx.nodeID !== broker.nodeID,
					callerNodeID: ctx.nodeID,
					nodeID: broker.nodeID,
					/*options: {
						timeout: ctx.options.timeout,
						retries: ctx.options.retries
					},*/
					requestID: ctx.requestID
				};
				let actionTags;
				// local action tags take precedence
				if (isFunction(opts.tags)) {
					actionTags = opts.tags;
				} else {
					// By default all params are captured. This can be overridden globally and locally
					actionTags = { ...{ params: true }, ...opts.tags };
				}

				if (isFunction(actionTags)) {
					const res = actionTags.call(ctx.service, ctx);
					if (res) Object.assign(tags, res);
				} else if (isPlainObject(actionTags)) {
					if (actionTags.params === true)
						tags.params =
							ctx.params != null && isPlainObject(ctx.params)
								? Object.assign({}, ctx.params)
								: ctx.params;
					else if (Array.isArray(actionTags.params))
						tags.params = _.pick(ctx.params, actionTags.params);

					if (actionTags.meta === true)
						tags.meta = ctx.meta != null ? Object.assign({}, ctx.meta) : ctx.meta;
					else if (Array.isArray(actionTags.meta))
						tags.meta = _.pick(ctx.meta, actionTags.meta);
				}

				if (opts.safetyTags) {
					tags = safetyObject(tags);
				}

				let spanName = `channel '${chan.name}'`;
				if (opts.spanName) {
					switch (typeof opts.spanName) {
						case "string":
							spanName = opts.spanName;
							break;
						case "function":
							spanName = opts.spanName.call(ctx.service, ctx);
							break;
					}
				}

				const span = ctx.startSpan(spanName, {
					id: ctx.id,
					type: "channel",
					traceID: ctx.requestID,
					parentID: ctx.parentID,
					service: ctx.service,
					sampled: ctx.tracing,
					tags
				});

				ctx.tracing = span.sampled;

				// Call the handler
				return handler(ctx, ...rest)
					.then(res => {
						ctx.finishSpan(span);
						return res;
					})
					.catch(err => {
						span.setError(err);
						ctx.finishSpan(span);
						throw err;
					});
			}.bind(this);
		}

		return handler;
	}

	return {
		name: "ChannelTracing",
		created(_broker) {
			broker = _broker;
			tracer = broker.tracer;
		},

		localChannel: tracingLocalChannelMiddleware
	};
};
