export = KafkaAdapter;
/**
 * Kafka adapter
 *
 * @class KafkaAdapter
 * @extends {BaseAdapter}
 */
declare class KafkaAdapter extends BaseAdapter {
    /**
     * Constructor of adapter
     * @param  {KafkaDefaultOptions|String?} opts
     */
    constructor(opts: KafkaDefaultOptions | (string | null));
    /** @type {Logger} */
    kafkaLogger: Logger;
    /** @type {KafkaClient} */
    client: KafkaClient;
    /** @type {KafkaProducer} */
    producer: KafkaProducer;
    /**
     * @type {Map<string,KafkaConsumer>}
     */
    consumers: Map<string, KafkaConsumer>;
    stopping: boolean;
    /**
     * Trying connect to the adapter.
     */
    tryConnect(): Promise<void>;
    /**
     * Commit new offset to Kafka broker.
     *
     * @param {KafkaConsumer} consumer
     * @param {String} topic
     * @param {Number} partition
     * @param {String} offset
     */
    commitOffset(consumer: KafkaConsumer, topic: string, partition: number, offset: string): Promise<void>;
    /**
     * Process a message
     *
     * @param {Channel & KafkaDefaultOptions} chan
     * @param {KafkaConsumer} consumer
     * @param {EachMessagePayload} payload
     * @returns {Promise<void>}
     */
    processMessage(chan: Channel & KafkaDefaultOptions, consumer: KafkaConsumer, { topic, partition, message }: EachMessagePayload): Promise<void>;
    /**
     * Moves message into dead letter
     *
     * @param {Channel} chan
     * @param {Object} message message
     */
    moveToDeadLetter(chan: Channel, { partition, message }: any): Promise<void>;
}
declare namespace KafkaAdapter {
    export { KafkaClient, KafkaProducer, KafkaConsumer, KafkaConfig, ProducerConfig, ConsumerConfig, EachMessagePayload, ServiceBroker, Logger, Channel, BaseDefaultOptions, KafkaDefaultOptions };
}
import BaseAdapter = require("./base");
/**
 * Logger instance
 */
type Logger = import("moleculer").LoggerInstance;
/**
 * Kafka Client
 */
type KafkaClient = import('kafkajs').Kafka;
/**
 * Kafka Producer
 */
type KafkaProducer = import('kafkajs').Producer;
/**
 * Kafka Consumer
 */
type KafkaConsumer = import('kafkajs').Consumer;
/**
 * Base channel definition
 */
type Channel = import("../index").Channel;
/**
 * Kafka Adapter configuration
 */
type KafkaDefaultOptions = {
    /**
     * Max-in-flight messages
     */
    maxInFlight: number;
    /**
     * Kafka config
     */
    kafka: KafkaConfig;
};
/**
 * Incoming message payload
 */
type EachMessagePayload = import('kafkajs').EachMessagePayload;
/**
 * Kafka configuration
 */
type KafkaConfig = import('kafkajs').KafkaConfig;
/**
 * Kafka producer configuration
 */
type ProducerConfig = import('kafkajs').ProducerConfig;
/**
 * Kafka consumer configuration
 */
type ConsumerConfig = import('kafkajs').ConsumerConfig;
/**
 * Moleculer Service Broker instance
 */
type ServiceBroker = import("moleculer").ServiceBroker;
/**
 * Base adapter options
 */
type BaseDefaultOptions = import("./base").BaseDefaultOptions;
