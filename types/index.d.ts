export function Middleware(mwOpts: MiddlewareOptions): {
    name: string;
    created(_broker: ServiceBroker): void;
    serviceCreated(svc: Service): Promise<void>;
    serviceStopping(svc: Service): Promise<void>;
    started(): Promise<void>;
    stopped(): Promise<void>;
};
export let Tracing: () => {
    name: string;
    created(_broker: any): void;
    localChannel: (handler: any, chan: any) => any;
};
export let Adapters: {
    Base: typeof import("./src/adapters/base");
    AMQP: typeof import("./src/adapters/amqp");
    Fake: typeof import("./src/adapters/fake");
    Kafka: typeof import("./src/adapters/kafka");
    NATS: typeof import("./src/adapters/nats");
    Redis: typeof import("./src/adapters/redis");
} & {
    resolve: (opt: object | string) => BaseAdapter;
    register: (name: string, value: BaseAdapter) => void;
};
