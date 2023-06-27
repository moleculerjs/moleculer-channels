export const Middleware: typeof import("./src");
export const Tracing: () => {
    name: string;
    created(_broker: any): void;
    localChannel: (handler: any, chan: any) => any;
};
export const Adapters: {
    Base: typeof import("./src/adapters/base");
    AMQP: typeof import("./src/adapters/amqp");
    Fake: typeof import("./src/adapters/fake");
    Kafka: typeof import("./src/adapters/kafka");
    NATS: typeof import("./src/adapters/nats");
    Redis: typeof import("./src/adapters/redis");
} & {
    resolve: (opt: any) => import("./src/adapters/base");
    register: (name: string, value: import("./src/adapters/base")) => void;
};
