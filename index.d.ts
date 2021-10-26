declare module "@moleculer/channels" {
    import { LoggerInstance as Logger, ServiceBroker, Service, Middleware } from "moleculer";
    import { KafkaConfig, Consumer as KafkaConsumer, EachMessagePayload, ProducerConfig, ConsumerConfig, BrokersFunction, ISocketFactory, logCreator, logLevel, RetryOptions, SASLOptions } from "kafkajs"
    import { Redis, Cluster as RedisCluster, ClusterOptions, ClusterNode, RedisOptions } from "ioredis";
    import { ConnectionOptions, ConsumerOpts, StreamConfig, JsMsg, JetStreamPublishOptions } from "nats";
    import * as tls from 'tls'

    export type ChannelOptions = {
        adapter: string | BaseChannelOptions;
        schemaProperty?: string;
        sendMethodName?: string;
        adapterPropertyName?: string;

    }
    type DeadLetteringOptions = {
        enabled: boolean;
        queueName: string;
    }
    interface BaseChannelOptions {
        type: string;
        maxInFlight?: number;
        maxRetries?: number;
        deadLettering?:DeadLetteringOptions
    }

    export interface AmqpDefaultOptions extends BaseChannelOptions {
        amqp: {
            url: string;
            socketOptions: object;
            queueOptions: object;
            exchangeOptions: object;
            messageOptions: object;
            consumerOptions: object;
        };
    }

    export interface KafkaDefaultOptions extends BaseChannelOptions {
        kafka: {
            brokers: string[] | BrokersFunction;
            ssl?: tls.ConnectionOptions | boolean;
            sasl?: SASLOptions;
            clientId?: string
            connectionTimeout?: number;
            authenticationTimeout?: number;
            reauthenticationThreshold?: number;
            requestTimeout?: number;
            enforceRequestTimeout?: boolean;
            retry?: RetryOptions;
            socketFactory?: ISocketFactory;
            logLevel?: logLevel;
            logCreator?: logCreator;
            producerOptions: ProducerConfig;
            consumerOptions: ConsumerConfig;
        }
    }


    export interface NatsStreamOptions extends BaseChannelOptions  {
        nats:{
            url?: string;
            connectionOptions?: ConnectionOptions;
            streamConfig?: StreamConfig;
            consumerOptions?: ConsumerOpts;
        }
     }

   export interface RedisDefaultOptions extends BaseChannelOptions{
        redis:{
            url?: string;
            consumerOptions?: {
                readTimeoutInterval?: number;
                minIdleTime?: number;
                claimInterval?: number;
                startID?: string;
                processingAttemptsInterval?: number;
            }
            cluster: {
                nodes: ClusterNode[];
                clusterOptions?: ClusterOptions;
            }
        }
    }


    export type Message = {
        content: string;
    }

    export interface MessageOptions {
        headers: object;
    }

    export interface MessageAmqpOptions extends MessageOptions {
        persistent: string;
        ttl: number;
        priority: number;
        correlationId: string;
    }

    export interface MessageKafkaOptions extends MessageOptions {
        key: string;
        raw: boolean;
        partition: number;
    }

    export type Channel = {
        id: string;
        name: string;
        group: string;
        unsubscribing: boolean;
        maxInFlight: number;
        maxRetries: number;
        deadLettering: DeadLetteringOptions;
        handler: Function;
    }

    interface RedisChannel extends Channel {
        xreadgroup: Function;
        xclaim: Function;
        failed_messages: Function;
        redis: string;
    }


    export interface BaseAdapter {
        /**
         * @param opts BaseDefaultOptions
         */
        constructor(opts: BaseChannelOptions): void;

        /**
         * @param broker ServiceBroker
         * @param logger Logger
         * */

        init(broker: ServiceBroker, logger: Logger): void;

        /**
         * Check the installed client library version.
         * https://github.com/npm/node-semver#usage
         *
         * @param {String} installedVersion
         * @param {String} requiredVersions
         * @returns {Boolean}
         */

        checkClientLibVersion(library: string, requiredVersions: string): Boolean;

        /**
         * Init active messages list for tracking messages of a channel
         * @param {string} channelID
         */
        initChannelActiveMessages(channelID: string): void;

        /**
         * Remove active messages list of a channel
         * @param {string} channelID
         */
        stopChannelActiveMessages(channelID: string): void;

        /**
         * Add IDs of the messages that are currently being processed
         *
         * @param {string} channelID Channel ID
         * @param {string[]} IDs List of IDs
         */
        addChannelActiveMessages(channelID: string, IDs: string[]): void;

        /**
         * Remove IDs of the messages that were already processed
         *
         * @param {string} channelID Channel ID
         * @param {string[]} IDs List of IDs
         */

        removeChannelActiveMessages(channelID: string, ID: string[]): void;

        /**
         * Get the number of active messages of a channel
         *
         * @param {string} channelID Channel ID
         * @returns {number}
         */
        getNumberOfChannelActiveMessages(channelID: string): number;

        /**
        * Get the number of channels
        */
        getNumberOfTrackedChannels(): number;

        /**
         * Given a topic name adds the prefix
         *
         * @param {String} topicName
         * @returns {String} New topic name
         */
        addPrefixTopic(topicName: string): string;

        /**
         * Connect to the adapter.
         */
        connect(): Promise<void>;

        /**
         * Disconnect from adapter
         */
        disconnect(): Promise<void>;

        /**
         * Subscribe to a channel.
         *
         * @param {Channel & BaseDefaultOptions} chan
         */
        subscribe(chan: Channel & BaseChannelOptions): Promise<void>;

        /**
         * Publish a payload to a channel.
         *
         * @param {String} channelName
         * @param {Object} payload
         * @param {Object?} opts
         */
        publish(channelName: string, payload: Object, opts?: MessageOptions | Partial<JetStreamPublishOptions>)

        /**
         * Unsubscribe from a channel.
         *
         * @param {Channel & BaseDefaultOptions} chan
         */
        unsubscribe(chan: Channel & BaseChannelOptions): Promise<void>;

    }

    export interface AmqpAdapter extends BaseAdapter {

        tryConnect(): Promise<void>;


        /**
        * Create a handler for the consumer.
        *
        * @param {Channel & AmqpDefaultOptions} chan
        * @returns {Function}
        */
        createConsumerHandler(chan: Channel & AmqpDefaultOptions): Function;

        /**
         * Move the message to dead letter queue
         * @param {Channel & AmqpDefaultOptions} chan
         * @param {Message} msg
         * @returns {Promise<void>}
         * */

        moveToDeadLetter(chan: Channel & AmqpDefaultOptions, msg: Message): Promise<void>



        /**
         * Resubscribe to all channels.
         * @returns {Promise<void>
         */
        resubscribeAllChannels()



    }

    export interface KafkaAdapter extends BaseAdapter {
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
        processMessage(chan: Channel & KafkaDefaultOptions, consumer: KafkaConsumer, payload: EachMessagePayload): Promise<void>;

        /**
         * Move the message to dead letter queue
         * @param {Channel & KafkaDefaultOptions} chan
         * @param {EachMessagePayload} payload
         * */
        moveToDeadLetter(chan: Channel & KafkaDefaultOptions, payload: EachMessagePayload): Promise<void>;

    }

    export interface RedisAdapter extends BaseAdapter {

        /**
       * Return redis or redis.cluster client instance
       *
       * @param {string} name Client name
       * @param {any} opts
       *
       * @memberof RedisTransporter
       * @returns {Promise<Cluster|Redis>)}
       */
        createRedisClient(name: string, opts:RedisDefaultOptions): Promise<Redis | RedisCluster>;

        /**
         * Process incoming messages.
         *
         * @param {Channel & RedisChannel & RedisDefaultOptions} chan
         * @param {Array<Object>} message
         */
        processMessage(chan: RedisChannel & RedisDefaultOptions, message: Array<Object>): Promise<void>;

        /**
         * Parse the message(s).
         *
         * @param {Array} messages
         * @returns {Array}
         */
        parseMessage(messages: Array<Object>): Array<Object>;

        /**
     * Moves message into dead letter
     *
     * @param {Channel & RedisChannel & RedisDefaultOptions} chan
     * @param {String} originalID ID of the dead message
     * @param {Object} message Raw (not serialized) message contents
     * @param {Object} headers Header contents
     */
        moveToDeadLetter(chan: RedisChannel & RedisDefaultOptions, originalID: string, message: Object, headers: Object): Promise<void>;


    }

    export interface NatsAdapter extends BaseAdapter {

        /**
         * Creates the callback handler
         *
         * @param {Channel} chan
         * @returns
         */
        createConsumerHandler(chan: Channel): Function;

        /**
         * Create a NATS Stream
         *
         * More info: https://docs.nats.io/jetstream/concepts/streams
         *
         * @param {String} streamName Name of the Stream
         * @param {Array<String>} subjects A list of subjects/topics to store in a stream
         * @param {StreamConfig} streamOpts JetStream stream configs
         */
        createStream(streamName: string, subjects: Array<string>, streamOpts: StreamConfig): Promise<void>;
        /**
   * Moves message into dead letter
   *
   * @param {Channel} chan
   * @param {JsMsg} message JetStream message
   */
        moveToDeadLetter(chan: Channel, message: JsMsg): Promise<void>;



    }


    interface ChannelFunction extends Middleware {
        /**
         * Create lifecycle hook of service
         * @param {ServiceBroker} _broker
         */
        created(_broker: ServiceBroker): void;

        /**
         * Created lifecycle hook of service
         *
         * @param {Service} svc
         */
        serviceCreated(svc: Service): Promise<void>;

        /**
         * Service stopping lifecycle hook.
         * Need to unsubscribe from the channels.
         *
         * @param {Service} svc
         */
        serviceStopping(svc: Service): Promise<void>;

        /**
        * Start lifecycle hook of service
        */
        started(): Promise<void>;

        /**
         * Stop lifecycle hook of service
         */
        stopped(): Promise<void>;

    }

  
    export function Middleware(opts:ChannelOptions ): ChannelFunction;


}