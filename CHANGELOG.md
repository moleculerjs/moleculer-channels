<a name="v0.2.0"></a>

# [0.2.0](https://github.com/moleculerjs/moleculer-channels/compare/v0.1.8...v0.2.0) (2025-05-31)

- Minimum Node version is 20.x
- Fixing Redis connection issue at starting when Redis server is not running.
- Add NATS reconnecting at starting when NATS server is not running.
- update dependencies

<a name="v0.1.8"></a>

# [0.1.8](https://github.com/moleculerjs/moleculer-channels/compare/v0.1.7...v0.1.8) (2023-08-06)

- chore(types): update MiddlewareOptions [72](https://github.com/moleculerjs/moleculer-channels/pull/72).
- Support Redis capped streams [70](https://github.com/moleculerjs/moleculer-channels/pull/70).

<a name="v0.1.7"></a>

# [0.1.7](https://github.com/moleculerjs/moleculer-channels/compare/v0.1.6...v0.1.7) (2023-07-15)

- add options for enable one-time assertExchange calling [63](https://github.com/moleculerjs/moleculer-channels/pull/63).
- asserting dead-letter exchange and queue [68](https://github.com/moleculerjs/moleculer-channels/pull/68).

<a name="v0.1.6"></a>

# [0.1.6](https://github.com/moleculerjs/moleculer-channels/compare/v0.1.5...v0.1.6) (2023-02-26)

- add Context-based handlers [64](https://github.com/moleculerjs/moleculer-channels/pull/64). Read more about [here](https://github.com/moleculerjs/moleculer-channels#context-based-messages)

<a name="v0.1.5"></a>

# [0.1.5](https://github.com/moleculerjs/moleculer-channels/compare/v0.1.4...v0.1.5) (2023-02-19)

- fix emitLocalChannelHandler [62](https://github.com/moleculerjs/moleculer-channels/pull/62)
- enforce buffer type on data passed to serializer [58](https://github.com/moleculerjs/moleculer-channels/pull/58)

<a name="v0.1.4"></a>

# [0.1.4](https://github.com/moleculerjs/moleculer-channels/compare/v0.1.3...v0.1.4) (2023-01-08)

- allow to subscribe with wildcard in NATS JetStream adapter [57](https://github.com/moleculerjs/moleculer-channels/pull/57)
- update dependencies

<a name="v0.1.3"></a>

# [0.1.3](https://github.com/moleculerjs/moleculer-channels/compare/v0.1.2...v0.1.3) (2022-12-17)

- add `Fake` adapter based on Moleculer built-in events.
- support amqplib v0.9, kafkajs v2, ioredis v5

<a name="v0.1.2"></a>

# [0.1.2](https://github.com/moleculerjs/moleculer-channels/compare/v0.1.1...v0.1.2) (2022-01-08)

- update deps.
- add emitLocalChannelHandler method. [#34](https://github.com/moleculerjs/moleculer-channels/pull/34)

<a name="v0.1.1"></a>

# [0.1.1](https://github.com/moleculerjs/moleculer-channels/compare/v0.1.0...v0.1.1) (2021-12-28)

-   Added Typescript support.
-   Added `connection` flag that prevents publishing events before the adapter is connected.
-   Added metrics.

<a name="v0.1.0"></a>

# v0.1.0 (2021-10-17)

First public version.
