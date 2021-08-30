![Moleculer logo](http://moleculer.services/images/banner.png)

![Integration Test](https://github.com/moleculerjs/channels/workflows/Integration%20Test/badge.svg)
[![Coverage Status](https://coveralls.io/repos/github/moleculerjs/channels/badge.svg?branch=master)](https://coveralls.io/github/moleculerjs/channels?branch=master)
[![Known Vulnerabilities](https://snyk.io/test/github/moleculerjs/channels/badge.svg)](https://snyk.io/test/github/moleculerjs/channels)
[![NPM version](https://badgen.net/npm/v/@moleculer/channels)](https://www.npmjs.com/package/@moleculer/channels)

# @moleculer/channels

Reliable messages for Moleculer services.

**This project is in work-in-progress. Don't use it in production.**

## Features

-   reliable messages with acknowledgement
-   multiple adapters
-   plugable adapters
-   max-in-flight option

## Install
Until the first version is published on NPM:
```
npm i moleculerjs/moleculer-channels#master
```

<!-- ```
npm i @moleculer/channels
``` -->

## Usage

### Register middleware in broker options

```js
// moleculer.config.js
const ChannelsMiddleware = require("@moleculer/channels").Middleware;

module.exports = {
    logger: true,

    middlewares: [
        ChannelsMiddleware({
            adapter: "redis://localhost:6379"
        })
    ]
};
```

By default, the middleware will add a `sendToChannel(<topic-name>, { payload })` method and `channelAdapter` property to the `broker` instance. Moreover, it will register handlers located in `channels` of a service schema.

### Consuming messages in Moleculer services

```js
module.exports = {
    name: "payments",

    actions: {
        /*...*/
    },

    channels: {
        // Shorthand format
        // In this case the consumer group is the service full name
        async "order.created"(payload) {
            // Do something with the payload
            // You should throw error if you want to NACK the message processing.
        },

        "payment.processed": {
            // Using custom consumer-group
            group: "other",
            async handler(payload) {
                // Do something with the payload
                // You should throw error if you want to NACK the message processing.
            }
        }
    },

    methods: {
        /*...*/
    }
};
```

>The received `payload` doesn't contain any Moleculer-specific data. It means you can use it to get messages from 3rd party topics/channels, as well.

### Producing messages

```js
broker.sendToChannel("order.created", {
    id: 1234,
    items: [
        /*...*/
    ]
});
```

>The sent message doesn't contain any Moleculer-specific data. It means you can use it to produce messages to 3rd party topics/channels, as well.

### Multiple adapters

**Registering multiple adapters**

```js
const ChannelsMiddleware = require("@moleculer/channels").Middleware;

// moleculer.config.js
module.exports = {
    logger: true,
    logLevel: "error",
    middlewares: [
        // Default options
        ChannelsMiddleware({
            adapter: {
                type: "Redis",
                options: {}
            }
        }),
        ChannelsMiddleware({
            adapter: "Redis",
            schemaProperty: "redisChannels",
            sendMethodName: "sendToRedisChannel",
            adapterPropertyName: "redisAdapter"
        }),
        ChannelsMiddleware({
            adapter: "AMQP",
            schemaProperty: "amqpChannels",
            sendMethodName: "sendToAMQPChannel",
            adapterPropertyName: "amqpAdapter"
        })
    ]
};
```

**Using multiple adapters in a service**

```js
module.exports = {
    name: "payments",

    actions: {
        /*...*/
    },

    channels: {
        "default.options.topic": {
            group: "mygroup",
            async handler(payload) {
                /*...*/
            }
        }
    },
    redisChannels: {
        "redis.topic": {
            group: "mygroup",
            async handler(payload) {
                /*...*/
            }
        }
    },
    amqpChannels: {
        "amqp.topic": {
            group: "mygroup",
            async handler(payload) {
                /*...*/
            }
        }
    }
};
```

## Middleware options

| Name | Type | Default value | Description |
| ---- | ---- | ------------- | ----------- |
| `adapter` | `String\|Object` | `null` | Adapter definition. It can be a `String` as name of the adapter or a connection string or an adapter definition `Object`. [More info](#adapters) |
| `schemaProperty` | `String` | `"channels"` | Name of the property in service schema. |
| `sendMethodName` | `String` | `"sendToChannel"` | Name of the method in ServiceBroker to send message to the channels. |
| `adapterPropertyName` | `String` | `"channelAdapter"` | Name of the property in ServiceBroker to access the `Adapter` instance directly. |

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

## Adapters

### Adapter default options

| Name | Type | Default value | Description |
| ---- | ---- | ------------- | ----------- |
| `consumerName` | `String` | ServiceBroker nodeID | Consumer name used by adapters. By default it's the nodeID of ServiceBroker. |
| `prefix` | `String` | ServiceBroker namespace | Prefix is used to separate topics between environments. By default, the prefix value is the namespace of the ServiceBroker. |
| `serializer` | `String\|Object\|Serializer` | `JSON` | Message serializer. You can use any [built-in serializer of Moleculer](https://moleculer.services/docs/0.14/networking.html#Serialization) or create a [custom one](https://moleculer.services/docs/0.14/networking.html#Custom-serializer). |
| `maxRetries` | `Number` | `3` | Maximum number of retries before sending the message to dead-letter-queue or drop. |
| `deadLettering.enabled` | `Boolean` | `false` | Enable "Dead-lettering" feature. |
| `deadLettering.queueName` | `String` | `FAILED_MESSAGES` | Name of dead-letter queue. |

TODO: adapter-specific options

### Redis-specific default options

| Name | Type | Default value | Description |
| ---- | ---- | ------------- | ----------- |
| `readTimeoutInternal` | `Number`| `0` | Maximum time (in milliseconds) while waiting for new messages. By default equals to 0, i.e., never timeout. More info [here](https://redis.io/commands/XREADGROUP#differences-between-xread-and-xreadgroup)
| `minIdleTime` | `Number` | `60 * 60 * 1000` | Time (in milliseconds) after which pending messages are considered NACKed and should be claimed. Defaults to 1 hour.
| `claimInterval` | `Number` | `100` | Interval (in milliseconds) between message claims
| `startID` | `String` | `$` | Starting point when consumers fetch data from the consumer group. By default equals to `$`, i.e., consumers will only see new elements arriving in the stream. More info [here](https://redis.io/commands/XGROUP)
| `processingAttemptsInterval` | `Number` | `0` | Interval (in milliseconds) between message transfer into `FAILED_MESSAGES` channel

## Failed message
If the service is not able to process a message, it should throw an `Error` inside the handler function. In case of error and if `maxRetries` option is a positive number, the adapter will redeliver the message to one of all consumers.
When the number of redelivering reaches the `maxRetries`, it will drop the message to avoid the 'retry-loop' effect.
Unless the dead-lettering feature is enabled with `deadLettering.enabled: true` option. In this case, the adapter moves the message into the `deadLettering.queueName` queue/topic.

## Channel options

| Name | Type | Default value | Description |
| ---- | ---- | ------------- | ----------- |
| `group` | `String` | Full name of service | Group name. It's used as a consumer group in adapter. By default, it's the full name of service (with version) |
| `maxRetries` | `Number` | `3` | Maximum number of retries before sending the message to dead-letter-queue or drop. |
| `deadLettering.enabled` | `Boolean` | `false` | Enable "Dead-lettering" feature. |
| `deadLettering.queueName` | `String` | `FAILED_MESSAGES` | Name of dead-letter queue. |
| `handler` | `Function(payload: any, rawMessage: any)` | `null` | Channel handler function. It receives the payload at first parameter. The second parameter is a raw message which depends on the adapter. |

TODO: adapter-specific options

### Redis specific channel options
It is possible to overwrite [redis default options](#redis-specific-default-options) at channel level.

| Name | Type | Default value | Description |
| ---- | ---- | ------------- | ----------- |
| `readTimeoutInternal` | `Number`| `0` | Maximum time (in milliseconds) while waiting for new messages. By default equals to 0, i.e., never timeout. More info [here](https://redis.io/commands/XREADGROUP#differences-between-xread-and-xreadgroup)
| `minIdleTime` | `Number` | `60 * 60 * 1000` | Time (in milliseconds) after which pending messages are considered NACKed and should be claimed. Defaults to 1 hour.
| `claimInterval` | `Number` | `100` | Interval (in milliseconds) between message claims
| `startID` | `String` | `$` | Starting point when consumers fetch data from the consumer group. By default equals to `$`, i.e., consumers will only see new elements arriving in the stream. More info [here](https://redis.io/commands/XGROUP)
| `processingAttemptsInterval` | `Number` | `0` | Interval (in milliseconds) between message transfer into `FAILED_MESSAGES` channel

### Redis Streams

[Redis Streams](https://redis.io/topics/streams-intro) was introduced in Redis 5.0. Hoverer, since this module relies on the [XAUTOCLAIM](https://redis.io/commands/xautoclaim) command, Redis >= 6.2.0 is required.

**Example**

```js
// moleculer.config.js
const ChannelsMiddleware = require("@moleculer/channels").Middleware;

module.exports = {
    middlewares: [
        ChannelsMiddleware({
            adapter: "redis://localhost:6379"
        })
    ]
};
```

**Example with options**

```js
// moleculer.config.js
const ChannelsMiddleware = require("@moleculer/channels").Middleware;

module.exports = {
    middlewares: [
        ChannelsMiddleware({
            adapter: {
                type: "Redis",
                options: {
                    redis: {
                        // ioredis constructor options: https://github.com/luin/ioredis#connect-to-redis
                        host: "127.0.0.1",
                        port: 6379,
                        db: 3,
                        password: "pass1234"
                    },
                    // Timeout interval (in milliseconds) while waiting for new messages. By default never timeout
                    readTimeoutInternal: 0,
                    // Time (in milliseconds) after which pending messages are considered NACKed and should be claimed. Defaults to 1 hour.
                    minIdleTime: 60 * 60 * 1000,
                    // Interval (in milliseconds) between two claims
                    claimInterval: 100,
                    // Maximum number of messages that can be processed simultaneously
                    maxInFlight: 1,
                    // "$" is a special ID. Consumers fetching data from the consumer group will only see new elements arriving in the stream.
                    // More info: https://redis.io/commands/XGROUP
                    startID: "$",
                    // Interval (in milliseconds) between message transfer into FAILED_MESSAGES channel
                    processingAttemptsInterval: 1000,
                }
            }
        })
    ]
};
```

**Redis Cluster**
```js
module.exports = {
    middlewares: [
        ChannelsMiddleware({
            adapter: {
                type: "Redis",
                options: {
					cluster: {
						nodes: [
							{ port: 6380, host: "127.0.0.1" },
							{ port: 6381, host: "127.0.0.1" },
							{ port: 6382, host: "127.0.0.1" }
						],
						options: { /* More information: https://github.com/luin/ioredis#cluster */ }
					}
                }
            }
        })
    ]
};
```

You can overwrite the default values in the handler definition.

**Overwrite default options in service**

```js
module.exports = {
    name: "payments",

    actions: {
        /*...*/
    },

    channels: {
        "order.created": {
            maxInFlight: 6,
            async handler(payload) {
                /*...*/
            }
        },
        "payment.processed": {
            minIdleTime: 10,
            claimInterval: 10,
            failedMessagesTopic: "CUSTOM_TOPIC_NAME",
            async handler(payload) {
                /*...*/
            }
        }
    }
};
```

### RabbitMQ

The RabbitMQ adapter uses the exchange-queue logic of RabbitMQ for creating consumer groups.

**Example**

```js
// moleculer.config.js
const ChannelsMiddleware = require("@moleculer/channels").Middleware;

module.exports = {
    middlewares: [
        ChannelsMiddleware({
            adapter: "amqp://localhost:5672"
        })
    ]
};
```

**Example with options**

```js
// moleculer.config.js
const ChannelsMiddleware = require("@moleculer/channels").Middleware;

module.exports = {
    middlewares: [
        ChannelsMiddleware({
            adapter: {
                type: "AMQP",
                options: {
                    amqp: {
                        url: "amqp://localhost:5672",
                        prefetch: 10,
                        // Options for `Amqplib.connect`
                        socketOptions: {},
                        // Options for `assertQueue()`
                        queueOptions: {},
                        // Options for `assertExchange()`
                        exchangeOptions: {},
                        // Options for `channel.publish()`
                        messageOptions: {},
                        // Options for `channel.consume()`
                        consumeOptions: {}
                    },
                    maxRetries: 3,
                    deadLettering: {
                        enabled: false,
                        //queueName: "DEAD_LETTER",
                        //exchangeName: "DEAD_LETTER"
                    }
                }
            }
        })
    ]
};
```

### Kafka

Coming soon.


### NATS JetStream

Coming soon.

<!-- ## Benchmark
There is some benchmark with all adapters. [You can find the results here.](benchmark/results/common/README.md) -->

## License

The project is available under the [MIT license](https://tldrlegal.com/license/mit-license).

## Contact

Copyright (c) 2021 MoleculerJS

[![@MoleculerJS](https://img.shields.io/badge/github-moleculerjs-green.svg)](https://github.com/moleculerjs) [![@MoleculerJS](https://img.shields.io/badge/twitter-MoleculerJS-blue.svg)](https://twitter.com/MoleculerJS)
