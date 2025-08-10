# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is `@moleculer/channels` - a reliable messaging solution for Moleculer microservices that provides persistent, durable message queuing via external adapters (Redis Streams, AMQP/RabbitMQ, Kafka, NATS JetStream). Unlike Moleculer's built-in events, this is not fire-and-forget but ensures message delivery with acknowledgments, retries, and dead-letter queues.

## Development Commands

### Essential Commands
- `npm test` - Run Jest tests with coverage
- `npm run ci` - Run Jest in watch mode
- `npm run lint` - ESLint check on src, examples, and test directories
- `npm run check` - TypeScript type checking without emitting files
- `npm run types` - Generate TypeScript declaration files

### Testing Infrastructure
- `npm run test:up` - Start Docker services (Redis, NATS, RabbitMQ, Kafka, etc.)
- `npm run test:down` - Stop and remove Docker test services
- Test services are defined in `test/docker-compose.yml`

### Development Tools
- `npm run dev` - Run examples with nodemon
- `npm run bench` - Run performance benchmarks
- `npm run bench:watch` - Run benchmarks with nodemon

### Dependencies
- `npm run deps` - Interactive dependency updates with ncu
- `npm run ci-deps` - Check for minor dependency updates
- `npm run ci-update-deps` - Update to minor dependency versions

## Architecture

### Core Components

**Middleware (`src/index.js`)**
- Main entry point that registers the channels middleware
- Creates `broker.sendToChannel()` method and `broker.channelAdapter` property
- Manages service lifecycle for channel registration/unregistration
- Handles context creation for message handlers when `context: true`
- Wraps handlers with metrics and custom middleware hooks

**Adapters (`src/adapters/`)**
- `base.js` - Abstract base class defining the adapter interface
- `redis.js` - Redis Streams implementation (requires Redis >= 6.2.0)
- `amqp.js` - RabbitMQ/AMQP implementation
- `kafka.js` - Apache Kafka implementation  
- `nats.js` - NATS JetStream implementation
- `fake.js` - In-memory adapter for testing (not for production)

**Message Flow**
1. Producer calls `broker.sendToChannel(channelName, payload, opts)`
2. Middleware serializes message and adds context headers if provided
3. Adapter publishes to external message broker
4. Consumer services receive messages via registered channel handlers
5. Failed messages retry up to `maxRetries`, then go to dead-letter queue if enabled

### Channel Registration
Services define channels in their schema:
```js
channels: {
  "topic.name": {
    group: "consumer-group",
    maxInFlight: 1,
    maxRetries: 3,
    deadLettering: { enabled: true },
    async handler(payload, raw) {
      // Process message
    }
  }
}
```

### Multi-Adapter Support
Multiple middlewares can be registered with different:
- `schemaProperty` (default: "channels")  
- `sendMethodName` (default: "sendToChannel")
- `adapterPropertyName` (default: "channelAdapter")

## Key Features

**Reliability**: Messages persist until acknowledged, with configurable retries
**Consumer Groups**: Load balance messages across service instances
**Dead Letter Queues**: Handle permanently failed messages
**Context Support**: Transfer Moleculer context metadata between services  
**Metrics**: Built-in metrics for message counts, processing time, active messages
**Tracing**: Distributed tracing support with context propagation
**Graceful Shutdown**: Wait for active message processing before stopping

## Testing

Tests are located in `test/` with both unit and integration tests. Integration tests require Docker services to be running (`npm run test:up`). The project uses Jest with coverage reporting.

## Examples

Extensive examples in `examples/` directory demonstrate:
- Simple usage, multi-adapters, consumer groups
- Context propagation, headers, serialization  
- Dead letter queues, retries, metrics
- Redis clustering, NATS wildcards
- Integration with tracking systems

## Code Style

- Uses Prettier with tabs (tabWidth: 4)  
- ESLint with security, Node.js, and Prettier plugins
- TypeScript definitions generated from JSDoc comments
- Lodash for utilities, semver for version handling