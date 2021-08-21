# TODO

## Common


## Redis
-   [ ] add example for Redis Cluster connection into README
-   [ ] add Redis Cluster test env with 3 nodes into docker-compose
-   [ ] fix `maxInFlight` logic because it gets new messages, while the max messages are in progress. Adapter should check the `getNumberOfChannelActiveMessages` before start a new `chan.xreadgroup`


## AMQP
-   [ ] use pending-message handling from base adapter.

## NATS Jet Stream

## Kafka
