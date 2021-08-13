# TODO

## Common

-   [x] using prefix as `broker.namespace` if not defined in `opts` for queue names
-   [x] move serializer to base adapter
-   [x] move active message tracking to base adapter
-   [x] checking subscription after reconnecting
-   [x] make adapter accessible (`broker.channelAdapter`) to the devs
-   [ ] middleware constructor option for the property name in svc schema (`channels`) and for the method name in the broker (`sendToChannel`)

## Redis

-   [x] one client per subscription
-   [x] make intervals configurable to give more freedom to the devs

## AMQP

## NATS Jet Stream

## Kafka
