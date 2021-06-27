![Moleculer logo](http://moleculer.services/images/banner.png)

![Integration Test](https://github.com/moleculerjs/channels/workflows/Integration%20Test/badge.svg)
[![Coverage Status](https://coveralls.io/repos/github/moleculerjs/channels/badge.svg?branch=master)](https://coveralls.io/github/moleculerjs/channels?branch=master)
[![Known Vulnerabilities](https://snyk.io/test/github/moleculerjs/channels/badge.svg)](https://snyk.io/test/github/moleculerjs/channels)
[![NPM version](https://badgen.net/npm/v/@moleculer/channels)](https://www.npmjs.com/package/@moleculer/channels)

# @moleculer/channels 
Reliable messages for Moleculer services.

**This project is in work-in-progress. Don't use it in production.**

## Features
- reliable messages with acknowledgement
- multiple adapters
- pluggable adapters
- max-in-flight option
- 

## Install
<!-- ```
npm i @moleculer/channels
``` -->

## Usage

**Register middleware**
```js
// moleculer.config.js
const ChannelsMiddleware = require("@moleculer/channels");

module.exports = {
    logger: true,

    middlewares: [
        ChannelsMiddleware({
            adapter: "redis://localhost:6379"
        })
    ]
};
```

### Consuming messages in Moleculer services
```js
module.exports = {
    name: "payments",
    
    actions: { /*...*/ },

    channels: {
        // Shorthand format
        // In this case the consumer group is the service full name
        async "order.created"(msg) {
            // Do something with the payload `msg.params`
            // You should throw error if you want to NACK the message processing.
        },

        "payment.processed": {
            // Using custom consumer-group
            group: "other",
            async handler(msg) {
                // Do something with the payload `msg.params`
                // You should throw error if you want to NACK the message processing.
            }
        }
    },

    methods: { /*...*/ }
}
```

### Producing messages
```js
broker.putChan("order.created", {
    id: 1234,
    items: [/*...*/]
});
```

### Adapters

#### Redis Streams
[Redis Streams](https://redis.io/topics/streams-intro) is supported since Redis 5.0.

**Example**
```js
// moleculer.config.js
const ChannelsMiddleware = require("@moleculer/channels");

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
const ChannelsMiddleware = require("@moleculer/channels");

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
                    }
                }
            }
        })
    ]
};
```

#### Kafka
Coming soon.

#### RabbitMQ
Coming soon.

#### NATS JetStream
Coming soon.

<!-- ## Benchmark
There is some benchmark with all adapters. [You can find the results here.](benchmark/results/common/README.md) -->

## License
The project is available under the [MIT license](https://tldrlegal.com/license/mit-license).

## Contact
Copyright (c) 2021 MoleculerJS

[![@MoleculerJS](https://img.shields.io/badge/github-moleculerjs-green.svg)](https://github.com/moleculerjs) [![@MoleculerJS](https://img.shields.io/badge/twitter-MoleculerJS-blue.svg)](https://twitter.com/MoleculerJS)
