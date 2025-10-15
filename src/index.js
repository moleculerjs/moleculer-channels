/*
 * @moleculer/channels
 * Copyright (c) 2021 MoleculerJS (https://github.com/moleculerjs/channels)
 * MIT Licensed
 */

"use strict";

const _ = require("lodash");
const { Context, METRIC } = require("moleculer");
const { BrokerOptionsError, ServiceSchemaError, MoleculerError } = require("moleculer").Errors;
const Adapters = require("./adapters");
const C = require("./constants");

/**
 * @typedef {import("moleculer").ServiceBroker} ServiceBroker Moleculer Service Broker instance
 * @typedef {import("moleculer").LoggerInstance} Logger Logger instance
 * @typedef {import("moleculer").Service} Service Moleculer service
 * @typedef {import("moleculer").Middleware} Middleware Moleculer middleware
 * @typedef {import("./adapters/base")} BaseAdapter Base adapter class
 */

/**
 * @typedef {Object} DeadLetteringOptions Dead-letter-queue options
 * @property {Boolean} enabled Enable dead-letter-queue
 * @property {String} queueName Name of the dead-letter queue
 * @property {String} exchangeName Name of the dead-letter exchange (only for AMQP adapter)
 * @property {Object} exchangeOptions Options for the dead-letter exchange (only for AMQP adapter)
 * @property {Object} queueOptions Options for the dead-letter queue (only for AMQP adapter)
 */

/**
 * @typedef {Object} Channel Base consumer configuration
 * @property {String} id Consumer ID
 * @property {String} name Channel/Queue/Stream name
 * @property {String} group Consumer group name
 * @property {Boolean} context Create Moleculer Context
 * @property {Boolean} unsubscribing Flag denoting if service is stopping
 * @property {Number?} maxInFlight Maximum number of messages that can be processed simultaneously
 * @property {Number} maxRetries Maximum number of retries before sending the message to dead-letter-queue
 * @property {DeadLetteringOptions?} deadLettering Dead-letter-queue options
 * @property {Function} handler User defined handler
 */

/**
 * @typedef {Object} ChannelRegistryEntry Registry entry
 * @property {Service} svc Service instance class
 * @property {String} name Channel name
 * @property {Channel} chan Channel object
 */

/**
 * @typedef {Object} AdapterConfig
 * @property {String} type Adapter name
 * @property {import("./adapters/base").BaseDefaultOptions & import("./adapters/amqp").AmqpDefaultOptions & import("./adapters/kafka").KafkaDefaultOptions & import("./adapters/nats").NatsDefaultOptions & import("./adapters/redis").RedisDefaultOptions} options Adapter options
 */

/**
 * @typedef {Object} MiddlewareOptions Middleware options
 * @property {String|AdapterConfig} adapter Adapter name or connection string or configuration object.
 * @property {String?} schemaProperty Property name of channels definition in service schema.
 * @property {String?} sendMethodName Method name to send messages.
 * @property {String?} adapterPropertyName Property name of the adapter instance in broker instance.
 * @property {String?} channelHandlerTrigger Method name to add to service in order to trigger channel handlers.
 * @property {boolean?} context Using Moleculer context in channel handlers by default.
 */

/**
 * Initialize the Channels middleware.
 *
 * @param {MiddlewareOptions} mwOpts
 * @returns Middleware
 */
module.exports = function ChannelsMiddleware(mwOpts) {
	mwOpts = _.defaultsDeep({}, mwOpts, {
		adapter: null,
		schemaProperty: "channels",
		sendMethodName: "sendToChannel",
		adapterPropertyName: "channelAdapter",
		channelHandlerTrigger: "emitLocalChannelHandler",
		context: false
	});

	/** @type {ServiceBroker} */
	let broker;
	/** @type {Logger} */
	let logger;
	/** @type {BaseAdapter} */
	let adapter;
	let started = false;
	/** @type {Array<ChannelRegistryEntry>}} */
	let channelRegistry = [];

	/**
	 * Register cannel
	 * @param {Service} svc
	 * @param {Channel} chan
	 */
	function registerChannel(svc, chan) {
		unregisterChannel(svc, chan);
		channelRegistry.push({ svc, name: chan.name, chan });
	}

	/**
	 * Remove channel from registry
	 * @param {Service} svc
	 * @param {Channel=} chan
	 */
	function unregisterChannel(svc, chan) {
		channelRegistry = channelRegistry.filter(
			item => !(item.svc.fullName == svc.fullName && (chan == null || chan.name == item.name))
		);
	}

	/**
	 *
	 * @param {ServiceBroker} broker
	 */
	function registerChannelMetrics(broker) {
		if (!broker.isMetricsEnabled()) return;

		broker.metrics.register({
			type: METRIC.TYPE_COUNTER,
			name: C.METRIC_CHANNELS_MESSAGES_SENT,
			labelNames: ["channel"],
			rate: true,
			unit: "call"
		});

		broker.metrics.register({
			type: METRIC.TYPE_COUNTER,
			name: C.METRIC_CHANNELS_MESSAGES_TOTAL,
			labelNames: ["channel", "group"],
			rate: true,
			unit: "msg"
		});

		broker.metrics.register({
			type: METRIC.TYPE_GAUGE,
			name: C.METRIC_CHANNELS_MESSAGES_ACTIVE,
			labelNames: ["channel", "group"],
			rate: true,
			unit: "msg"
		});

		broker.metrics.register({
			type: METRIC.TYPE_HISTOGRAM,
			name: C.METRIC_CHANNELS_MESSAGES_TIME,
			labelNames: ["channel", "group"],
			quantiles: true,
			unit: "msg"
		});
	}

	return {
		name: "Channels",

		/**
		 * Create lifecycle hook of service
		 * @param {ServiceBroker} _broker
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
			if (!broker[mwOpts.sendMethodName]) {
				broker[mwOpts.sendMethodName] = broker.wrapMethod(
					"sendToChannel",
					(channelName, payload, opts) => {
						broker.metrics.increment(
							C.METRIC_CHANNELS_MESSAGES_SENT,
							{ channel: channelName },
							1
						);

						// Transfer Context properties
						if (opts && opts.ctx) {
							if (!opts.headers) opts.headers = {};

							opts.headers.$requestID = opts.ctx.requestID;
							opts.headers.$parentID = opts.ctx.id;
							opts.headers.$tracing = "" + opts.ctx.tracing;
							opts.headers.$level = "" + opts.ctx.level;
							if (opts.ctx.service) {
								opts.headers.$caller = opts.ctx.service.fullName;
							}

							if (opts.ctx.currentChannelName) {
								opts.headers.$parentChannelName = opts.ctx.currentChannelName;
							}
							if (opts.ctx.currentServiceName) {
								opts.headers.$parentServiceName = opts.ctx.currentServiceName;
							}

							// Serialize meta and headers
							opts.headers.$meta = adapter.serializer
								.serialize(opts.ctx.meta)
								.toString("base64");

							if (opts.ctx.headers) {
								opts.headers.$headers = adapter.serializer
									.serialize(opts.ctx.headers)
									.toString("base64");
							}

							delete opts.ctx;
						}

						return adapter.publish(adapter.addPrefixTopic(channelName), payload, opts);
					}
				);
			} else {
				throw new BrokerOptionsError(
					`broker.${mwOpts.sendMethodName} method is already in use by another Channel middleware`,
					null
				);
			}

			// Add adapter reference to the broker instance
			if (!broker[mwOpts.adapterPropertyName]) {
				broker[mwOpts.adapterPropertyName] = adapter;
			} else {
				throw new BrokerOptionsError(
					`broker.${mwOpts.adapterPropertyName} property is already in use by another Channel middleware`,
					null
				);
			}

			registerChannelMetrics(broker);
		},

		/**
		 * Created lifecycle hook of service
		 *
		 * @param {Service} svc
		 */
		async serviceCreated(svc) {
			if (_.isPlainObject(svc.schema[mwOpts.schemaProperty])) {
				//svc.$channels = {};
				// Process `channels` in the schema
				await broker.Promise.mapSeries(
					Object.entries(svc.schema[mwOpts.schemaProperty]),
					async ([name, def]) => {
						/** @type {Partial<Channel>} */
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

						if (!chan.name) chan.name = adapter.addPrefixTopic(name);
						if (!chan.group) chan.group = svc.fullName;
						if (chan.context == null) chan.context = mwOpts.context;

						// Consumer ID
						chan.id = adapter.addPrefixTopic(
							`${broker.nodeID}.${svc.fullName}.${chan.name}`
						);
						chan.unsubscribing = false;

						// Wrap the original handler
						let handler = broker.Promise.method(chan.handler).bind(svc);

						// Wrap the handler with custom middlewares
						const handler2 = broker.middlewares.wrapHandler(
							"localChannel",
							handler,
							chan
						);

						let wrappedHandler = handler2;

						// Wrap the handler with context creating
						if (chan.context) {
							wrappedHandler = (msg, raw) => {
								let parentCtx,
									caller,
									meta,
									ctxHeaders,
									parentChannelName,
									parentServiceName;
								const headers = adapter.parseMessageHeaders(raw);
								if (headers) {
									if (headers.$requestID) {
										parentCtx = {
											id: headers.$parentID,
											requestID: headers.$requestID,
											tracing: headers.$tracing === "true",
											level: headers.$level ? parseInt(headers.$level) : 0
										};
										caller = headers.$caller;
										parentChannelName = headers.$parentChannelName;
										parentServiceName = headers.$parentServiceName;
									}

									if (headers.$meta) {
										meta = adapter.serializer.deserialize(
											Buffer.from(headers.$meta, "base64")
										);
									}

									if (headers.$headers) {
										ctxHeaders = adapter.serializer.deserialize(
											Buffer.from(headers.$headers, "base64")
										);
									}
								}

								const ctx = Context.create(broker, null, msg, {
									parentCtx,
									caller: headers?.$parentServiceName
										? headers.$parentServiceName
										: caller,
									meta,
									headers: ctxHeaders
								});

								// attach channelName to context so in the handler we can use it
								ctx.currentChannelName = chan.name;
								ctx.currentServiceName = svc.fullName;
								// It's the parent channel name that triggered this event
								ctx.parentChannelName = parentChannelName;
								ctx.parentServiceName = parentServiceName;

								ctx.service = svc;

								return handler2(ctx, raw);
							};
						}

						chan.handler = wrappedHandler;

						// Add metrics for the handler
						if (broker.isMetricsEnabled()) {
							chan.handler = (...args) => {
								const labels = { channel: name, group: chan.group };
								const timeEnd = broker.metrics.timer(
									C.METRIC_CHANNELS_MESSAGES_TIME,
									labels
								);
								broker.metrics.increment(C.METRIC_CHANNELS_MESSAGES_TOTAL, labels);
								broker.metrics.increment(C.METRIC_CHANNELS_MESSAGES_ACTIVE, labels);
								return wrappedHandler(...args)
									.then(res => {
										timeEnd();
										broker.metrics.decrement(
											C.METRIC_CHANNELS_MESSAGES_ACTIVE,
											labels
										);
										return res;
									})
									.catch(err => {
										timeEnd();
										broker.metrics.decrement(
											C.METRIC_CHANNELS_MESSAGES_ACTIVE,
											labels
										);

										throw err;
									});
							};
						}

						//svc.$channels[name] = chan;
						logger.debug(
							`Registering '${chan.name}' channel in '${svc.fullName}' service with group '${chan.group}'...`
						);
						registerChannel(svc, chan);

						if (started) {
							// If middleware has already started, we should subscribe to the channel right now.
							await adapter.subscribe(chan, svc);
						}
					}
				);

				// Attach method to simplify unit testing
				if (!svc[mwOpts.channelHandlerTrigger]) {
					/**
					 * Call a local channel event handler. Useful for unit tests.
					 *
					 * @param {String} channelName
					 * @param {Object} payload
					 * @param {Object} raw
					 * @returns
					 */
					svc[mwOpts.channelHandlerTrigger] = (channelName, payload, raw) => {
						svc.logger.debug(
							`${mwOpts.channelHandlerTrigger} called '${channelName}' channel handler`
						);

						if (!svc.schema[mwOpts.schemaProperty][channelName])
							return Promise.reject(
								new MoleculerError(
									`'${channelName}' is not registered as local channel event handler`,
									500,
									"NOT_FOUND_CHANNEL",
									{ channelName }
								)
							);

						// Shorthand definition
						if (typeof svc.schema[mwOpts.schemaProperty][channelName] === "function")
							return svc.schema[mwOpts.schemaProperty][channelName].call(
								svc, // Attach reference to service
								payload,
								raw
							);

						// Object definition
						return svc.schema[mwOpts.schemaProperty][channelName].handler.call(
							svc, // Attach reference to service
							payload,
							raw
						);
					};
				} else {
					throw new BrokerOptionsError(
						`service.${mwOpts.channelHandlerTrigger} method is already in use by another Channel middleware`,
						null
					);
				}
			}
		},

		/**
		 * Service stopping lifecycle hook.
		 * Need to unsubscribe from the channels.
		 *
		 * @param {Service} svc
		 */
		async serviceStopping(svc) {
			await Promise.all(
				channelRegistry
					.filter(item => item.svc.fullName == svc.fullName)
					.map(async ({ chan }) => {
						await adapter.unsubscribe(chan);
					})
			);
			unregisterChannel(svc);
		},

		/**
		 * This hook is called after broker starting.
		 */
		async starting() {
			logger.info("Channel adapter is connecting...");
			await adapter.connect();
			logger.debug("Channel adapter connected.");

			logger.info(`Subscribing to ${channelRegistry.length} channels...`);
			await broker.Promise.mapSeries(
				channelRegistry,
				async ({ chan, svc }) => await adapter.subscribe(chan, svc)
			);

			started = true;
		},

		/**
		 * This hook is called after broker stopped.
		 */
		async stopped() {
			logger.info("Channel adapter is disconnecting...");
			await adapter.disconnect();
			logger.debug("Channel adapter disconnected.");

			started = false;
		}
	};
};
