export = NatsAdapter;
/**
 * @typedef {import("nats").NatsConnection} NatsConnection NATS Connection
 * @typedef {import("nats").ConnectionOptions} ConnectionOptions NATS Connection Opts
 * @typedef {import("nats").StreamConfig} StreamConfig NATS Configuration Options
 * @typedef {import("nats").JetStreamManager} JetStreamManager NATS Jet Stream Manager
 * @typedef {import("nats").JetStreamClient} JetStreamClient NATS JetStream Client
 * @typedef {import("nats").JetStreamPublishOptions} JetStreamPublishOptions JetStream Publish Options
 * @typedef {import("nats").ConsumerOptsBuilder} ConsumerOptsBuilder NATS JetStream ConsumerOptsBuilder
 * @typedef {import("nats").ConsumerOpts} ConsumerOpts Jet Stream Consumer Opts
 * @typedef {import("nats").JetStreamOptions} JetStreamOptions Jet Stream Options
 * @typedef {import("nats").JsMsg} JsMsg Jet Stream Message
 * @typedef {import("nats").JetStreamSubscription} JetStreamSubscription Jet Stream Subscription
 * @typedef {import("nats").MsgHdrs} MsgHdrs Jet Stream Headers
 * @typedef {import("moleculer").ServiceBroker} ServiceBroker Moleculer Service Broker instance
 * @typedef {import("moleculer").LoggerInstance} Logger Logger instance
 * @typedef {import("../index").Channel} Channel Base channel definition
 * @typedef {import("./base").BaseDefaultOptions} BaseDefaultOptions Base adapter options
 */
/**
 * @typedef {Object} NatsDefaultOptions
 * @property {Object} nats NATS lib configuration
 * @property {String} url String containing the URL to NATS server
 * @property {ConnectionOptions} nats.connectionOptions
 * @property {StreamConfig} nats.streamConfig More info: https://docs.nats.io/jetstream/concepts/streams
 * @property {ConsumerOpts} nats.consumerOptions More info: https://docs.nats.io/jetstream/concepts/consumers
 */
/**
 * NATS JetStream adapter
 *
 * More info: https://github.com/nats-io/nats.deno/blob/main/jetstream.md
 * More info: https://github.com/nats-io/nats-architecture-and-design#jetstream
 * More info: https://docs.nats.io/jetstream/concepts/
 *
 * @class NatsAdapter
 * @extends {BaseAdapter}
 */
declare class NatsAdapter extends BaseAdapter {
    constructor(opts: any);
    /** @type { BaseDefaultOptions & NatsDefaultOptions } */
    opts: BaseDefaultOptions & NatsDefaultOptions;
    /** @type {NatsConnection} */
    connection: NatsConnection;
    /** @type {JetStreamManager} */
    manager: JetStreamManager;
    /** @type {JetStreamClient} */
    client: JetStreamClient;
    /** @type {Map<string,JetStreamSubscription>} */
    subscriptions: Map<string, JetStreamSubscription>;
    stopping: boolean;
    /**
     * Subscribe to a channel with a handler.
     *
     * @param {Channel & NatsDefaultOptions} chan
     */
    subscribe(chan: Channel & NatsDefaultOptions): Promise<void>;
    /**
     * Creates the callback handler
     *
     * @param {Channel} chan
     * @returns
     */
    createConsumerHandler(chan: Channel): (err: import("nats").NatsError, message: JsMsg) => Promise<void>;
    /**
     * Create a NATS Stream
     *
     * More info: https://docs.nats.io/jetstream/concepts/streams
     *
     * @param {String} streamName Name of the Stream
     * @param {Array<String>} subjects A list of subjects/topics to store in a stream
     * @param {StreamConfig} streamOpts JetStream stream configs
     */
    createStream(streamName: string, subjects: Array<string>, streamOpts: StreamConfig): Promise<import("nats").StreamInfo>;
    /**
     * Moves message into dead letter
     *
     * @param {Channel} chan
     * @param {JsMsg} message JetStream message
     */
    moveToDeadLetter(chan: Channel, message: JsMsg): Promise<void>;
    /**
     * Publish a payload to a channel.
     *
     * @param {String} channelName
     * @param {any} payload
     * @param {Partial<JetStreamPublishOptions>?} opts
     */
    publish(channelName: string, payload: any, opts?: Partial<JetStreamPublishOptions> | null): Promise<void>;
}
declare namespace NatsAdapter {
    export { NatsConnection, ConnectionOptions, StreamConfig, JetStreamManager, JetStreamClient, JetStreamPublishOptions, ConsumerOptsBuilder, ConsumerOpts, JetStreamOptions, JsMsg, JetStreamSubscription, MsgHdrs, ServiceBroker, Logger, Channel, BaseDefaultOptions, NatsDefaultOptions };
}
import BaseAdapter = require("./base");
/**
 * Base adapter options
 */
type BaseDefaultOptions = import("./base").BaseDefaultOptions;
type NatsDefaultOptions = {
    /**
     * NATS lib configuration
     */
    nats: any;
    /**
     * String containing the URL to NATS server
     */
    url: string;
    connectionOptions: ConnectionOptions;
    /**
     * More info: https://docs.nats.io/jetstream/concepts/streams
     */
    streamConfig: StreamConfig;
    /**
     * More info: https://docs.nats.io/jetstream/concepts/consumers
     */
    consumerOptions: ConsumerOpts;
};
/**
 * NATS Connection
 */
type NatsConnection = import("nats").NatsConnection;
/**
 * NATS Jet Stream Manager
 */
type JetStreamManager = import("nats").JetStreamManager;
/**
 * NATS JetStream Client
 */
type JetStreamClient = import("nats").JetStreamClient;
/**
 * Jet Stream Subscription
 */
type JetStreamSubscription = import("nats").JetStreamSubscription;
/**
 * Base channel definition
 */
type Channel = import("../index").Channel;
/**
 * Jet Stream Message
 */
type JsMsg = import("nats").JsMsg;
/**
 * NATS Configuration Options
 */
type StreamConfig = import("nats").StreamConfig;
/**
 * JetStream Publish Options
 */
type JetStreamPublishOptions = import("nats").JetStreamPublishOptions;
/**
 * NATS Connection Opts
 */
type ConnectionOptions = import("nats").ConnectionOptions;
/**
 * NATS JetStream ConsumerOptsBuilder
 */
type ConsumerOptsBuilder = import("nats").ConsumerOptsBuilder;
/**
 * Jet Stream Consumer Opts
 */
type ConsumerOpts = import("nats").ConsumerOpts;
/**
 * Jet Stream Options
 */
type JetStreamOptions = import("nats").JetStreamOptions;
/**
 * Jet Stream Headers
 */
type MsgHdrs = import("nats").MsgHdrs;
/**
 * Moleculer Service Broker instance
 */
type ServiceBroker = import("moleculer").ServiceBroker;
/**
 * Logger instance
 */
type Logger = import("moleculer").LoggerInstance;
