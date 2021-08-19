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
-   pluggable adapters
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

By default, the middleware will add a `sendToChannel(<topic-name>, { payload })` method and `channelAdapter` property to the `broker` instance.
Moreover, it will register handlers located in `channels` of a service schema.

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

## Channel options

| Name | Type | Default value | Description |
| ---- | ---- | ------------- | ----------- |
| `group` | `String` | Full name of service | Group name. It's used as a consumer group in adapter. By default, it's the full name of service (with version) |
| `handler` | `Function(payload: any)` | `null` | Channel handler function. |
TODO: adapter-specific options

## Adapters

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
                    // Max number of messages to fetch in a single read
                    maxInFlight: 1,
                    // "$" is a special ID. Consumers fetching data from the consumer group will only see new elements arriving in the stream.
                    // More info: https://redis.io/commands/XGROUP
                    startID: "$",
                    // Maximum number of attempts to process a message. After this number is achieved messages are moved into "FAILED_MESSAGES".
                    maxProcessingAttempts: 10,
                    // Interval (in milliseconds) between message transfer into FAILED_MESSAGES channel
                    processingAttemptsInterval: 1000,
                    // Default channel name where failed messages will be placed
                    failedMessagesTopic: "FAILED_MESSAGES"
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

### Kafka

Coming soon.

### RabbitMQ

TODO: examples

### NATS JetStream

Coming soon.

<!-- ## Benchmark
There is some benchmark with all adapters. [You can find the results here.](benchmark/results/common/README.md) -->

## License

The project is available under the [MIT license](https://tldrlegal.com/license/mit-license).

## Contact

Copyright (c) 2021 MoleculerJS

[![@MoleculerJS](https://img.shields.io/badge/github-moleculerjs-green.svg)](https://github.com/moleculerjs) [![@MoleculerJS](https://img.shields.io/badge/twitter-MoleculerJS-blue.svg)](https://twitter.com/MoleculerJS)
