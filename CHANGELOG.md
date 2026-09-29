<a name="v0.4.0 [UNRELEASED]"></a>

# [0.4.0](https://github.com/moleculerjs/moleculer-channels/compare/v0.3.1...v0.4.0)

## Breaking changes

- NATS adapter migrated from the `nats` (v2) client to the new `@nats-io/transport-node` & `@nats-io/jetstream` (v3) client. Install the new packages with `npm install @nats-io/transport-node @nats-io/jetstream`, the `nats` module is no longer used.
- NATS `consumerOptions` use the flat `ConsumerConfig` shape. The legacy nested `consumerOptions.config` shape is deprecated: its fields are flattened automatically with a deprecation warning, other legacy fields (`mack`, `queue`, `deliver_subject`, `callbackFn`) are dropped. Previously the nested settings were silently ignored (and newer JetStream servers reject them with `invalid JSON: json: unknown field "config"`).
- NATS consumers are created as JetStream **pull** consumers instead of push consumers. On the first start, existing consumers created by the previous version are migrated automatically: they are recreated as pull consumers and resume from the old consumer's last acknowledged message. Unacknowledged messages are redelivered (at-least-once semantics) and some already-acked messages near the ack floor may be redelivered as duplicates.
- NATS durable consumer names contain the channel name (`<group>_<channel>` instead of `<group>`), so multiple channels sharing a stream and a consumer group get their own consumers instead of overwriting each other's consumer config.
- Rolling back to a previous (v2-based) version is **not supported** after the migration: the previous version fails with `durable requires no queue group` on the pull consumers created by this version. Do not mix replicas of the previous version with replicas of this version during an upgrade.

## Fixes

- NATS: restarting a service no longer fails with `consumer delivery policy is deliver new, but optional start sequence is also set` (10094) or `deliver policy can not be updated` (10012). Existing consumers are updated with mutable fields only (`max_ack_pending`, `ack_wait`, `max_deliver`, `filter_subject`, ...), immutable fields (`deliver_policy`, `ack_policy`, `opt_start_*`) are never sent.
- NATS: stream resolution falls back to looking the stream up by subject when the stream creation fails, so streams that already exist under a custom name (created by an operator or another service) work again.
- NATS: starting multiple replicas concurrently during the legacy-consumer migration no longer fails with `consumer not found` (10014). JetStream errors are matched by their API error codes instead of error messages.

---

<a name="v0.3.1"></a>

# [0.3.1](https://github.com/moleculerjs/moleculer-channels/compare/v0.3.0...v0.3.1)

## Fixes

- Fix NATS adapter ignoring connection URL when passed as string (e.g. `"nats://host:4222"`) [#95](https://github.com/moleculerjs/moleculer-channels/issues/95)
- Add unit tests for string URL constructor handling across all adapters

---

<a name="v0.3.0"></a>

# [0.3.0](https://github.com/moleculerjs/moleculer-channels/compare/v0.2.0...v0.3.0)

## Breaking changes

- Minimum Node.js version is **22.x** (matching Moleculer 0.15)
- Middleware lifecycle hook changed from `started()` to `starting()` (Moleculer 0.15 compatibility)
- ESLint migrated from v8 to v10 (flat config)

## New features

- Add `ctx.channelName` and `ctx.parentChannelName` to context-based handlers for channel chain tracking [#92](https://github.com/moleculerjs/moleculer-channels/pull/92)
- Attach `ctx.service` to context in channel handlers
- Store error info in dead-letter queue headers (`x-error-message`, `x-error-code`, `x-error-stack`, `x-error-data`, etc.) [#91](https://github.com/moleculerjs/moleculer-channels/pull/91)
- Add customizable `transformErrorToHeaders` and `transformHeadersToErrorData` functions in dead-lettering options
- Add `errorInfoTTL` option for Redis adapter error info storage
- Parse error info from dead-letter headers back into `ctx.headers` for downstream consumers
- Throw `INVALID_MESSAGE_SERIALIZATION` error when incoming messages cannot be deserialized (all adapters) [#76](https://github.com/moleculerjs/moleculer-channels/issues/76)
- Log errors for message parsing failures in AMQP and NATS adapters

## Fixes

- Support `amqplib` v0.10.x

## TypeScript

- Rewrite type definitions: replace generated `types/` directory with hand-crafted root `index.d.ts`
- Fix `Serializer` import for Moleculer 0.15 (`Serializers.Base`)
- Add error header constants and error transform function types
- Fix `sendToChannel` module augmentation to use `SendOptions`
- Add TypeScript consumer test (`test/typescript/`)
- Add TypeCheck GitHub Actions workflow

## Dependencies

- Moleculer peer dependency: `^0.14.12 || ^0.15.0-0`
- ESLint 8 → 10 (flat config migration), remove `eslint-plugin-node` and `eslint-plugin-promise`
- TypeScript 5 → 6
- Update all minor/patch dependencies

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

- Added Typescript support.
- Added `connection` flag that prevents publishing events before the adapter is connected.
- Added metrics.

<a name="v0.1.0"></a>

# v0.1.0 (2021-10-17)

First public version.
