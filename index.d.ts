/*
 * @moleculer/channels
 * Copyright (c) 2025 MoleculerJS (https://github.com/moleculerjs/channels)
 * MIT Licensed
 */

declare module "@moleculer/channels" {
	import {
		ServiceBroker,
		Context,
		Service,
		Middleware,
		Logger,
		Serializer
	} from "moleculer";

	// === Core Interfaces ===

	/**
	 * Dead-letter-queue options
	 */
	export interface DeadLetteringOptions {
		/** Enable dead-letter-queue */
		enabled: boolean;
		/** Name of the dead-letter queue */
		queueName?: string;
		/** Name of the dead-letter exchange (only for AMQP adapter) */
		exchangeName?: string;
		/** Options for the dead-letter exchange (only for AMQP adapter) */
		exchangeOptions?: Record<string, any>;
		/** Options for the dead-letter queue (only for AMQP adapter) */
		queueOptions?: Record<string, any>;
	}

	/**
	 * Base consumer configuration
	 */
	export interface Channel<TThis = Service> {
		/** Consumer ID */
		id?: string;
		/** Channel/Queue/Stream name */
		name?: string;
		/** Consumer group name */
		group?: string;
		/** Create Moleculer Context */
		context?: boolean;
		/** Flag denoting if service is stopping */
		unsubscribing?: boolean;
		/** Maximum number of messages that can be processed simultaneously */
		maxInFlight?: number;
		/** Maximum number of retries before sending the message to dead-letter-queue */
		maxRetries?: number;
		/** Dead-letter-queue options */
		deadLettering?: DeadLetteringOptions;
		/** User defined handler */
		handler?: (this: TThis, payload: any, raw?: any) => Promise<any> | any;
		/** Tracing options */
		tracing?: boolean | TracingOptions;
	}

	/**
	 * Channel registry entry
	 */
	export interface ChannelRegistryEntry {
		/** Service instance class */
		svc: Service;
		/** Channel name */
		name: string;
		/** Channel object */
		chan: Channel;
	}

	/**
	 * Adapter configuration object
	 */
	export interface AdapterConfig {
		/** Adapter name */
		type: string;
		/** Adapter options */
		options?: Record<string, any>;
	}

	/**
	 * Middleware options
	 */
	export interface MiddlewareOptions {
		/** Adapter name, connection string, or configuration object */
		adapter: string | AdapterConfig;
		/** Property name of channels definition in service schema */
		schemaProperty?: string;
		/** Method name to send messages */
		sendMethodName?: string;
		/** Property name of the adapter instance in broker instance */
		adapterPropertyName?: string;
		/** Method name to add to service in order to trigger channel handlers */
		channelHandlerTrigger?: string;
		/** Using Moleculer context in channel handlers by default */
		context?: boolean;
	}

	/**
	 * Tracing options
	 */
	export interface TracingOptions {
		/** Enable/disable tracing */
		enabled?: boolean;
		/** Custom span name */
		spanName?: string | ((ctx: Context<any, any>) => string);
		/** Tags for tracing */
		tags?: Record<string, any> | ((ctx: Context<any, any>) => Record<string, any>);
		/** Enable safety tags */
		safetyTags?: boolean;
	}

	/**
	 * Send options for publishing messages
	 */
	export interface SendOptions {
		/** Headers to include with message */
		headers?: Record<string, any>;
		/** Moleculer context to propagate */
		ctx?: Context<any, any>;
		/** Additional adapter-specific options */
		[key: string]: any;
	}

	// === Base Adapter ===

	/**
	 * Base adapter default options
	 */
	export interface BaseDefaultOptions {
		/** Adapter prefix */
		prefix?: string;
		/** Name of the consumer */
		consumerName?: string;
		/** Type of serializer to use in message exchange */
		serializer?: string;
		/** Maximum number of retries before sending the message to dead-letter-queue or drop */
		maxRetries?: number;
		/** Maximum number of messages that can be processed in parallel */
		maxInFlight?: number;
		/** Dead-letter-queue options */
		deadLettering?: DeadLetteringOptions;
	}

	/**
	 * Base adapter class
	 */
	export class BaseAdapter {
		/** Adapter options */
		opts: BaseDefaultOptions;
		/** Service broker instance */
		broker: ServiceBroker;
		/** Logger instance */
		logger: Logger;
		/** Promise constructor */
		Promise: typeof Promise;
		/** Serializer instance */
		serializer: Serializer;
		/** Active messages tracking */
		activeMessages: Map<string, Array<string | number>>;
		/** Connection status */
		connected: boolean;

		constructor(opts?: BaseDefaultOptions);

		/**
		 * Initialize the adapter
		 */
		init(broker: ServiceBroker, logger: Loggers): void;

		/**
		 * Register adapter related metrics
		 */
		registerAdapterMetrics(broker: ServiceBroker): void;

		/**
		 * Increment metrics
		 */
		metricsIncrement(metricName: string, chan: Channel): void;

		/**
		 * Check client library version
		 */
		checkClientLibVersion(library: string, requiredVersions: string): boolean;

		/**
		 * Initialize active messages tracking for a channel
		 */
		initChannelActiveMessages(channelID: string, toThrow?: boolean): void;

		/**
		 * Stop active messages tracking for a channel
		 */
		stopChannelActiveMessages(channelID: string): void;

		/**
		 * Add active message IDs
		 */
		addChannelActiveMessages(channelID: string, IDs: Array<string | number>): void;

		/**
		 * Remove active message IDs
		 */
		removeChannelActiveMessages(channelID: string, IDs: Array<string | number>): void;

		/**
		 * Get number of active messages for a channel
		 */
		getNumberOfChannelActiveMessages(channelID: string): number;

		/**
		 * Get number of tracked channels
		 */
		getNumberOfTrackedChannels(): number;

		/**
		 * Add prefix to topic name
		 */
		addPrefixTopic(topicName: string): string;

		/**
		 * Connect to the adapter
		 */
		connect(): Promise<void>;

		/**
		 * Disconnect from adapter
		 */
		disconnect(): Promise<void>;

		/**
		 * Subscribe to a channel
		 */
		subscribe(chan: Channel, svc: Service): Promise<void>;

		/**
		 * Unsubscribe from a channel
		 */
		unsubscribe(chan: Channel): Promise<void>;

		/**
		 * Publish a payload to a channel
		 */
		publish(channelName: string, payload: any, opts?: SendOptions): Promise<void>;

		/**
		 * Parse message headers from raw message
		 */
		parseMessageHeaders(raw: any): Record<string, any> | null;
	}

	// === Adapter-specific options ===

	/**
	 * Redis adapter options
	 */
	export interface RedisDefaultOptions extends BaseDefaultOptions {
		redis?: {
			/** Redis connection URL */
			url?: string;
			/** Consumer options */
			consumerOptions?: {
				/** Read timeout interval in milliseconds */
				readTimeoutInterval?: number;
				/** Min idle time for claiming pending messages */
				minIdleTime?: number;
				/** Claim interval in milliseconds */
				claimInterval?: number;
				/** Starting ID for consumer group */
				startID?: string;
				/** Processing attempts interval */
				processingAttemptsInterval?: number;
			};
			/** Additional Redis client options */
			[key: string]: any;
		};
	}

	/**
	 * AMQP adapter options
	 */
	export interface AmqpDefaultOptions extends BaseDefaultOptions {
		amqp?: {
			/** AMQP connection URL(s) */
			url?: string | string[];
			/** Socket options */
			socketOptions?: Record<string, any>;
			/** Queue options */
			queueOptions?: Record<string, any>;
			/** Exchange options */
			exchangeOptions?: Record<string, any>;
			/** Message options */
			messageOptions?: Record<string, any>;
			/** Consumer options */
			consumerOptions?: Record<string, any>;
			/** Publish assert exchange options */
			publishAssertExchange?: {
				enabled?: boolean;
				exchangeOptions?: Record<string, any>;
			};
		};
	}

	/**
	 * Kafka adapter options
	 */
	export interface KafkaDefaultOptions extends BaseDefaultOptions {
		kafka?: {
			/** Kafka brokers */
			brokers?: string[];
			/** Log creator function */
			logCreator?: () => (logEntry: any) => void;
			/** Producer options */
			producerOptions?: Record<string, any>;
			/** Consumer options */
			consumerOptions?: Record<string, any>;
			/** Additional Kafka client config */
			[key: string]: any;
		};
	}

	/**
	 * NATS adapter options
	 */
	export interface NatsDefaultOptions extends BaseDefaultOptions {
		/** NATS URL */
		url?: string;
		nats?: {
			/** Connection options */
			connectionOptions?: Record<string, any>;
			/** Stream configuration */
			streamConfig?: Record<string, any>;
			/** Consumer options */
			consumerOptions?: {
				mack?: boolean;
				config?: {
					deliver_policy?: string;
					ack_policy?: string;
					max_ack_pending?: number;
				};
			};
		};
	}

	/**
	 * Fake adapter options (for testing)
	 */
	export interface FakeOptions extends BaseDefaultOptions {
		/** Service prefix */
		servicePrefix?: string;
		/** Event prefix */
		eventPrefix?: string;
	}

	// === Adapter Classes ===

	/**
	 * Redis adapter
	 */
	export class RedisAdapter extends BaseAdapter {
		constructor(opts?: RedisDefaultOptions | string);
	}

	/**
	 * AMQP adapter
	 */
	export class AmqpAdapter extends BaseAdapter {
		constructor(opts?: AmqpDefaultOptions | string);
	}

	/**
	 * Kafka adapter
	 */
	export class KafkaAdapter extends BaseAdapter {
		constructor(opts?: KafkaDefaultOptions | string);
	}

	/**
	 * NATS adapter
	 */
	export class NatsAdapter extends BaseAdapter {
		constructor(opts?: NatsDefaultOptions | string);
	}

	/**
	 * Fake adapter (for testing)
	 */
	export class FakeAdapter extends BaseAdapter {
		constructor(opts?: FakeOptions | string);
	}

	// === Adapters Registry ===
	export interface AdaptersRegistry {
		Base: typeof BaseAdapter;
		AMQP: typeof AmqpAdapter;
		Fake: typeof FakeAdapter;
		Kafka: typeof KafkaAdapter;
		NATS: typeof NatsAdapter;
		Redis: typeof RedisAdapter;
		resolve(opt: string | AdapterConfig | BaseAdapter): BaseAdapter;
		register(name: string, value: typeof BaseAdapter): void;
	}

	// === Constants ===
	export interface Constants {
		/** Number of redelivery attempts */
		HEADER_REDELIVERED_COUNT: string;
		/** Consumer group name */
		HEADER_GROUP: string;
		/** Name of the channel where an error occurred while processing the message */
		HEADER_ORIGINAL_CHANNEL: string;
		/** Name of consumer group that could not process the message properly */
		HEADER_ORIGINAL_GROUP: string;
		/** Metrics constants */
		METRIC_CHANNELS_MESSAGES_SENT: string;
		METRIC_CHANNELS_MESSAGES_TOTAL: string;
		METRIC_CHANNELS_MESSAGES_ACTIVE: string;
		METRIC_CHANNELS_MESSAGES_TIME: string;
		METRIC_CHANNELS_MESSAGES_ERRORS_TOTAL: string;
		METRIC_CHANNELS_MESSAGES_RETRIES_TOTAL: string;
		METRIC_CHANNELS_MESSAGES_DEAD_LETTERING_TOTAL: string;
	}

	// === Enhanced ServiceBroker interface ===
	export interface EnhancedServiceBroker extends ServiceBroker {
		/**
		 * Send message to channel (added by channels middleware)
		 */
		sendToChannel(channelName: string, payload: any, opts?: SendOptions): Promise<void>;

		/**
		 * Channel adapter instance (added by channels middleware)
		 */
		channelAdapter: BaseAdapter;
	}

	// === Enhanced Service interface ===
	export interface EnhancedService extends Service {
		/**
		 * Emit local channel handler (added by channels middleware for testing)
		 */
		emitLocalChannelHandler(channelName: string, payload: any, raw?: any): Promise<any>;
	}

	declare module "moleculer" {
		export interface ServiceBroker {
			sendToChannel(channelName: string, payload: any, opts?: { ctx?: Context<any, any> });
		}

		export interface ServiceSchema<TSettings = ServiceSettingSchema,
		TMethods = Record<string, any>,
		TVars = Record<string, any>,
		TThis = Service<TSettings> & TVars & TMethods> {
			/**
			 * Channel definitions for the service
			 */
			channels?: {
				[channelName: string]:
					| Channel<TThis>
					| ((this: TThis, payload: any, raw?: any) => Promise<any> | any);
			};
		}
	}

	// === Main Module Exports ===

	/**
	 * Create Channels middleware
	 */
	declare function ChannelsMiddleware(opts: MiddlewareOptions): Middleware;

	/**
	 * Tracing middleware factory
	 */
	declare function TracingMiddleware(): Middleware;

	export {
		ChannelsMiddleware as Middleware,
		TracingMiddleware as Tracing,
		AdaptersRegistry as Adapters
	}
}
