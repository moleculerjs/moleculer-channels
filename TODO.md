# TODO

## Common
- [ ] check dead-letter topic in failed test cases

## Redis
- [ ] add example for Redis Cluster connection into README
- [ ] fix `maxInFlight` logic because it gets new messages, while the max messages are in progress. Adapter should check the `getNumberOfChannelActiveMessages` before start a new `chan.xreadgroup`


## AMQP

## NATS Jet Stream

## Kafka
