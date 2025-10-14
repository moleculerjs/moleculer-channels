# Context

This is a codebase for message delivery for MoleculerJS services via external queue/channel/topic. Unlike moleculer built-in events, this is **not** a fire-and-forget solution. It's a persistent, durable and reliable message sending solution. The module uses an external message queue/streaming server that stores messages until they are successfully processed.
The module supports multiple queue/streaming servers, including Redis, RabbitMQ, NATS JetStream, Kafka. It provides a unified interface for sending and receiving messages across different brokers.

# Directory Structure

```
.
├── index.js
├── package.json
├── examples
├── src
│   ├── adapters
│   │   ├── amqp.js
│   │   ├── base.js
│   │   ├── fake.js
│   │   ├── index.js
│   │   ├── kafka.js
│   │   ├── nats.js
│   │   └── redis.js
│   ├── constants.js
│   ├── index.js
│   └── tracing.js
├── test
│   ├── docker-compose.yml
│   ├── integration
│   │   └── index.spec.js
│   └── unit
│       └── index.spec.js
```

# Key Files

-   `index.js`: Entry point of the module.
-   `src/adapters/`: Contains adapter implementations for different message brokers (Redis, RabbitMQ, NATS, Kafka). All of adapters extend from `base.js`.
-   `src/constants.js`: Defines constants used across the module such as metrics names, Redis header keys, etc.
-   `src/tracing.js`: Implements tracing middleware for tracing the message flow. The middleware is implemented via MoleculerJS middleware, and it works with any adapter. It is initialized via `created()` [lifecycle method](https://moleculer.services/docs/0.14/middlewares#created-broker-async) of the service broker.
-   `src/index.js`: Main file that implements `created()`, `serviceCreated()`, `serviceStopping()`, and `stopped()`. It is responsible for creating broker-level methods like `sendToChannel()` (configurable via `sendMethodName` option), exposing raw adapter via `channelAdapter` (configurable via `adapterPropertyName` option), registering metrics, registering service topics listeners and cleaning up resources on broker stop.
-   `test/`: Contains integration tests. Integration tests use Docker Compose to spin up required message brokers. The focus of the tests is to verify the integration with different message brokers and ensure that messages are sent and received correctly and that from Moleculer's perspective, the behavior is consistent across different adapters.
-   `package.json`: Defines the module's dependencies, scripts, jest configuration, and metadata
-   `examples/`: Contains different ways of using the module with different adapters and configurations.

The core file from which the adapters are created from is `src/adapters/base.js`. All adapters extend from this base class and implement the required methods for sending and receiving messages.

** Skeleton of `src/adapters/base.js` **

```js
class BaseAdapter {
    /**
     * Constructor of adapter
     * @param  {Object?} opts
     */
    constructor(opts) {
        /** @type {BaseDefaultOptions} */
        this.opts = _.defaultsDeep({}, opts, {
            consumerName: null,
            prefix: null,
            serializer: "JSON",
            maxRetries: 3,
            maxInFlight: 1,
            deadLettering: {
                enabled: false,
                queueName: "FAILED_MESSAGES"
            }
        });

        /**
         * Tracks the messages that are still being processed by different clients
         * @type {Map<string, Array<string|number>>}
         */
        this.activeMessages = new Map();

        /** @type {Boolean} Flag indicating the adapter's connection status */
        this.connected = false;
    }

    /**
     * Initialize the adapter.
     *
     * @param {ServiceBroker} broker
     * @param {Logger} logger
     */
    init(broker, logger) {
        this.broker = broker;
        this.logger = logger;
        this.Promise = broker.Promise;

        if (!this.opts.consumerName) this.opts.consumerName = this.broker.nodeID;
        if (this.opts.prefix == null) this.opts.prefix = broker.namespace;

        this.logger.info("Channel consumer name:", this.opts.consumerName);
        this.logger.info("Channel prefix:", this.opts.prefix);

        // create an instance of serializer (default to JSON)
        /** @type {Serializer} */
        this.serializer = Serializers.resolve(this.opts.serializer);
        this.serializer.init(this.broker);
        this.logger.info("Channel serializer:", this.broker.getConstructorName(this.serializer));

        this.registerAdapterMetrics(broker);
    }

    /**
     * Register adapter related metrics
     * @param {ServiceBroker} broker
     */
    registerAdapterMetrics(broker) {
        if (!broker.isMetricsEnabled()) return;

        broker.metrics.register({
            type: METRIC.TYPE_COUNTER,
            name: C.METRIC_CHANNELS_MESSAGES_ERRORS_TOTAL,
            labelNames: ["channel", "group"],
            rate: true,
            unit: "msg"
        });

        broker.metrics.register({
            type: METRIC.TYPE_COUNTER,
            name: C.METRIC_CHANNELS_MESSAGES_RETRIES_TOTAL,
            labelNames: ["channel", "group"],
            rate: true,
            unit: "msg"
        });

        broker.metrics.register({
            type: METRIC.TYPE_COUNTER,
            name: C.METRIC_CHANNELS_MESSAGES_DEAD_LETTERING_TOTAL,
            labelNames: ["channel", "group"],
            rate: true,
            unit: "msg"
        });
    }

    /**
     *
     * @param {String} metricName
     * @param {Channel} chan
     */
    metricsIncrement(metricName, chan) {
        if (!this.broker.isMetricsEnabled()) return;

        this.broker.metrics.increment(metricName, {
            channel: chan.name,
            group: chan.group
        });
    }

    /**
     * Check the installed client library version.
     * https://github.com/npm/node-semver#usage
     *
     * @param {String} library
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

    /**
     * Init active messages list for tracking messages of a channel
     * @param {string} channelID
     * @param {Boolean?} toThrow Throw error if already exists
     */
    initChannelActiveMessages(channelID, toThrow = true) {
        if (this.activeMessages.has(channelID)) {
            if (toThrow)
                throw new MoleculerError(
                    `Already tracking active messages of channel ${channelID}`
                );

            return;
        }

        this.activeMessages.set(channelID, []);
    }

    /**
     * Remove active messages list of a channel
     * @param {string} channelID
     */
    stopChannelActiveMessages(channelID) {
        if (!this.activeMessages.has(channelID)) {
            throw new MoleculerError(`Not tracking active messages of channel ${channelID}`);
        }

        if (this.activeMessages.get(channelID).length !== 0) {
            throw new MoleculerError(
                `Can't stop tracking active messages of channel ${channelID}. It still has ${
                    this.activeMessages.get(channelID).length
                } messages being processed.`
            );
        }

        this.activeMessages.delete(channelID);
    }

    /**
     * Add IDs of the messages that are currently being processed
     *
     * @param {string} channelID Channel ID
     * @param {Array<string|number>} IDs List of IDs
     */
    addChannelActiveMessages(channelID, IDs) {
        if (!this.activeMessages.has(channelID)) {
            throw new MoleculerError(`Not tracking active messages of channel ${channelID}`);
        }

        this.activeMessages.get(channelID).push(...IDs);
    }

    /**
     * Remove IDs of the messages that were already processed
     *
     * @param {string} channelID Channel ID
     * @param {string[]|number[]} IDs List of IDs
     */
    removeChannelActiveMessages(channelID, IDs) {
        if (!this.activeMessages.has(channelID)) {
            throw new MoleculerError(`Not tracking active messages of channel ${channelID}`);
        }

        const messageList = this.activeMessages.get(channelID);

        IDs.forEach(id => {
            const idx = messageList.indexOf(id);
            if (idx != -1) {
                messageList.splice(idx, 1);
            }
        });
    }

    /**
     * Get the number of active messages of a channel
     *
     * @param {string} channelID Channel ID
     */
    getNumberOfChannelActiveMessages(channelID) {
        if (!this.activeMessages.has(channelID)) {
            //throw new MoleculerError(`Not tracking active messages of channel ${channelID}`);
            return 0;
        }

        return this.activeMessages.get(channelID).length;
    }

    /**
     * Get the number of channels
     */
    getNumberOfTrackedChannels() {
        return this.activeMessages.size;
    }

    /**
     * Given a topic name adds the prefix
     *
     * @param {String} topicName
     * @returns {String} New topic name
     */
    addPrefixTopic(topicName) {
        if (this.opts.prefix != null && this.opts.prefix != "" && topicName) {
            return `${this.opts.prefix}.${topicName}`;
        }

        return topicName;
    }

    /**
     * Connect to the adapter.
     */
    async connect() {
        /* istanbul ignore next */
        throw new Error("This method is not implemented.");
    }

    /**
     * Disconnect from adapter
     */
    async disconnect() {
        /* istanbul ignore next */
        throw new Error("This method is not implemented.");
    }

    /**
     * Subscribe to a channel.
     *
     * @param {Channel} chan
     * @param {Service} svc
     */
    async subscribe(chan, svc) {
        /* istanbul ignore next */
        throw new Error("This method is not implemented.");
    }

    /**
     * Unsubscribe from a channel.
     *
     * @param {Channel} chan
     */
    async unsubscribe(chan) {
        /* istanbul ignore next */
        throw new Error("This method is not implemented.");
    }

    /**
     * Publish a payload to a channel.
     * @param {String} channelName
     * @param {any} payload
     * @param {Object?} opts
     */
    async publish(channelName, payload, opts) {
        /* istanbul ignore next */
        throw new Error("This method is not implemented.");
    }

    /**
     * Parse the headers from incoming message to a POJO.
     * @param {any} raw
     * @returns {object}
     */
    parseMessageHeaders(raw) {
        return raw ? raw.headers : null;
    }
}

module.exports = BaseAdapter;
```

# Initialization example

```js
// moleculer.config.js
const ChannelsMiddleware = require("@moleculer/channels").Middleware;

module.exports = {
    logger: true,

    middlewares: [
        ChannelsMiddleware({
            adapter: "redis://localhost:6379",
            sendMethodName: "sendToChannel",
            adapterPropertyName: "channelAdapter",
            schemaProperty: "channels"
        })
    ]
};
```

# Concepts

## Failed message

If the service is not able to process a message, it should throw an `Error` inside the handler function. In case of error and if `maxRetries` option is a positive number, the adapter will redeliver the message to one of all consumers.
When the number of redelivering reaches the `maxRetries`, it will drop the message to avoid the 'retry-loop' effect.
If the dead-lettering feature is enabled with `deadLettering.enabled: true` option then the adapter will move the message into the `deadLettering.queueName` queue/topic.

## Graceful stopping

The adapters track the messages that are being processed. This means that when a service or the broker is stopping the adapter will block the process and wait until all active messages are processed.

## Middleware hooks

It is possible to wrap the handlers and the send method in Moleculer middleware. The module defines two hooks to cover it. The `localChannel` hook is similar to [`localAction`](https://moleculer.services/docs/0.14/middlewares.html#localAction-next-action) but it wraps the channel handlers in service schema. The `sendToChannel` hook is similar to [`emit`](https://moleculer.services/docs/0.14/middlewares.html#emit-next) or [`broadcast`](https://moleculer.services/docs/0.14/middlewares.html#broadcast-next) but it wraps the `broker.sendToChannel` publisher method.

**Example**

```js
// moleculer.config.js
const ChannelsMiddleware = require("@moleculer/channels").Middleware;

const MyMiddleware = {
    name: "MyMiddleware",

    // Wrap the channel handlers
    localChannel(next, chan) {
        return async (msg, raw) => {
            this.logger.info(kleur.magenta(`  Before localChannel for '${chan.name}'`), msg);
            await next(msg, raw);
            this.logger.info(kleur.magenta(`  After localChannel for '${chan.name}'`), msg);
        };
    },

    // Wrap the `broker.sendToChannel` method
    sendToChannel(next) {
        return async (channelName, payload, opts) => {
            this.logger.info(kleur.yellow(`Before sendToChannel for '${channelName}'`), payload);
            await next(channelName, payload, opts);
            this.logger.info(kleur.yellow(`After sendToChannel for '${channelName}'`), payload);
        };
    }
};

module.exports = {
    logger: true,

    middlewares: [
        MyMiddleware,
        ChannelsMiddleware({
            adapter: "redis://localhost:6379"
        })
    ]
};
```

## Context-based messages

In order to use Moleculer Context in handlers (transferring `ctx.meta` and tracing information) you should set the `context: true` option in channel definition object or in middleware options to enable it for all channel handlers.

# Instructions

To solve any potential issues or add new features, please follow these steps:

-   create a new folder in the `examples/` directory with a descriptive name for your example
-   create `index.js` file inside the new folder that demonstrates the feature or fixes the issue
-   modify or add logic in the `src/` directory as needed
-   create or modify tests in the `test/` directory to cover your changes
