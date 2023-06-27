export = RedisAdapter;
/**
 * @typedef {import("ioredis").Cluster} Cluster Redis cluster instance. More info: https://github.com/luin/ioredis/blob/master/API.md#Cluster
 * @typedef {import("ioredis").Redis} Redis Redis instance. More info: https://github.com/luin/ioredis/blob/master/API.md#Redis
 * @typedef {import("ioredis").RedisOptions} RedisOptions
 * @typedef {import("moleculer").ServiceBroker} ServiceBroker Moleculer Service Broker instance
 * @typedef {import("moleculer").LoggerInstance} Logger Logger instance
 * @typedef {import("../index").Channel} Channel Base channel definition
 * @typedef {import("./base").BaseDefaultOptions} BaseDefaultOptions Base adapter options
 */
/**
 * @typedef {Object} RedisDefaultOptions Redis Adapter configuration
 * @property {Number} readTimeoutInterval Timeout interval (in milliseconds) while waiting for new messages. By default equals to 0, i.e., never timeout
 * @property {Number} minIdleTime Time (in milliseconds) after which pending messages are considered NACKed and should be claimed. Defaults to 1 hour.
 * @property {Number} claimInterval Interval (in milliseconds) between message claims
 * @property {String} startID Starting point when consumers fetch data from the consumer group. By default equals to "$", i.e., consumers will only see new elements arriving in the stream.
 * @property {Number} processingAttemptsInterval Interval (in milliseconds) between message transfer into FAILED_MESSAGES channel
 */
/**
 * @typedef {Object} RedisChannel Redis specific channel options
 * @property {Function} xreadgroup Function for fetching new messages from redis stream
 * @property {Function} xclaim Function for claiming pending messages
 * @property {Function} failed_messages Function for checking NACKed messages and moving them into dead letter queue
 * @property {RedisDefaultOptions} redis
 */
/**
 * @typedef {Object} RedisOpts
 * @property {Object} redis Redis lib configuration
 * @property {RedisDefaultOptions} redis.consumerOptions
 */
/**
 * Redis Streams adapter
 *
 * @class RedisAdapter
 * @extends {BaseAdapter}
 */
declare class RedisAdapter extends BaseAdapter {
    /** @type {RedisOpts & BaseDefaultOptions} */
    opts: RedisOpts & BaseDefaultOptions;
    /**
     * @type {Map<string,Cluster|Redis>}
     */
    clients: Map<string, Cluster | Redis>;
    pubName: string;
    claimName: string;
    nackedName: string;
    stopping: boolean;
    /**
     * Disconnect from adapter
     */
    disconnect(): Promise<any>;
    /**
     * Return redis or redis.cluster client instance
     *
     * @param {string} name Client name
     * @param {any} opts
     *
     * @memberof RedisTransporter
     * @returns {Promise<Cluster|Redis>}
     */
    createRedisClient(name: string, opts: any): Promise<Cluster | Redis>;
    /**
     * Subscribe to a channel with a handler.
     *
     * @param {Channel & RedisChannel & RedisDefaultOptions} chan
     */
    subscribe(chan: Channel & RedisChannel & RedisDefaultOptions): Promise<void>;
    /**
     * Unsubscribe from a channel.
     *
     * @param {Channel & RedisChannel & RedisDefaultOptions} chan
     */
    unsubscribe(chan: Channel & RedisChannel & RedisDefaultOptions): Promise<any>;
    /**
     * Process incoming messages.
     *
     * @param {Channel & RedisChannel & RedisDefaultOptions} chan
     * @param {Array<Object>} message
     */
    processMessage(chan: Channel & RedisChannel & RedisDefaultOptions, message: Array<any>): Promise<void>;
    /**
     * Parse the message(s).
     *
     * @param {Array} messages
     * @returns {any}
     */
    parseMessage(messages: any[]): any;
    /**
     * Moves message into dead letter
     *
     * @param {Channel & RedisChannel & RedisDefaultOptions} chan
     * @param {String} originalID ID of the dead message
     * @param {Object} message Raw (not serialized) message contents
     * @param {Object} headers Header contents
     */
    moveToDeadLetter(chan: Channel & RedisChannel & RedisDefaultOptions, originalID: string, message: any, headers: any): Promise<void>;
    /**
     * Publish a payload to a channel.
     *
     * @param {String} channelName
     * @param {any} payload
     * @param {Object?} opts
     */
    publish(channelName: string, payload: any, opts?: any | null): Promise<void>;
}
declare namespace RedisAdapter {
    export { Cluster, Redis, RedisOptions, ServiceBroker, Logger, Channel, BaseDefaultOptions, RedisDefaultOptions, RedisChannel, RedisOpts };
}
import BaseAdapter = require("./base");
type RedisOpts = {
    /**
     * Redis lib configuration
     */
    redis: {
        consumerOptions: RedisDefaultOptions;
    };
};
/**
 * Base adapter options
 */
type BaseDefaultOptions = import("./base").BaseDefaultOptions;
/**
 * Redis cluster instance. More info: https://github.com/luin/ioredis/blob/master/API.md#Cluster
 */
type Cluster = import("ioredis").Cluster;
declare let Redis: any;
/**
 * Base channel definition
 */
type Channel = import("../index").Channel;
/**
 * Redis specific channel options
 */
type RedisChannel = {
    /**
     * Function for fetching new messages from redis stream
     */
    xreadgroup: Function;
    /**
     * Function for claiming pending messages
     */
    xclaim: Function;
    /**
     * Function for checking NACKed messages and moving them into dead letter queue
     */
    failed_messages: Function;
    redis: RedisDefaultOptions;
};
/**
 * Redis Adapter configuration
 */
type RedisDefaultOptions = {
    /**
     * Timeout interval (in milliseconds) while waiting for new messages. By default equals to 0, i.e., never timeout
     */
    readTimeoutInterval: number;
    /**
     * Time (in milliseconds) after which pending messages are considered NACKed and should be claimed. Defaults to 1 hour.
     */
    minIdleTime: number;
    /**
     * Interval (in milliseconds) between message claims
     */
    claimInterval: number;
    /**
     * Starting point when consumers fetch data from the consumer group. By default equals to "$", i.e., consumers will only see new elements arriving in the stream.
     */
    startID: string;
    /**
     * Interval (in milliseconds) between message transfer into FAILED_MESSAGES channel
     */
    processingAttemptsInterval: number;
};
/**
 * Redis instance. More info: https://github.com/luin/ioredis/blob/master/API.md#Redis
 */
type Redis = import("ioredis").Redis;
type RedisOptions = import("ioredis").RedisOptions;
/**
 * Moleculer Service Broker instance
 */
type ServiceBroker = import("moleculer").ServiceBroker;
/**
 * Logger instance
 */
type Logger = import("moleculer").LoggerInstance;
