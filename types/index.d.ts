export function Middleware(mwOpts: import("./src").MiddlewareOptions): {
    name: string;
    created(_broker: import("moleculer").ServiceBroker): void;
    serviceCreated(svc: import("moleculer").Service<import("moleculer").ServiceSettingSchema>): Promise<void>;
    serviceStopping(svc: import("moleculer").Service<import("moleculer").ServiceSettingSchema>): Promise<void>;
    started(): Promise<void>;
    stopped(): Promise<void>;
};
export const Adapters: {
    Base: typeof import("./src/adapters/base");
    AMQP: typeof import("./src/adapters/amqp");
    Kafka: typeof import("./src/adapters/kafka");
    NATS: typeof import("./src/adapters/nats");
    Redis: typeof import("./src/adapters/redis");
} & {
    resolve: (opt: any) => import("./src/adapters/base");
    register: (name: string, value: import("./src/adapters/base")) => void;
};
