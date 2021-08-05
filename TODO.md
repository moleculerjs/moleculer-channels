# TODO

## Common

-   [ ] using prefix as `broker.namespace` if not defined in `opts` for queue names
-   [x] move serializer to base adapter
-   [x] move active message tracking to base adapter
-   [ ] checking subscription after reconnecting
-   [ ] make adapter accessible (`this.adapter`) to the devs

## Redis

-   [x] one client per subscription
-   [x] make intervals configurable to give more freedom to the devs

## AMQP

## NATS Jet Stream

## Kafka
