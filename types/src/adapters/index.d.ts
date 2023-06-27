declare const _exports: {
    Base: typeof import("./base");
    AMQP: typeof import("./amqp");
    Fake: typeof import("./fake");
    Kafka: typeof import("./kafka");
    NATS: typeof import("./nats");
    Redis: typeof import("./redis");
} & {
    resolve: typeof resolve;
    register: typeof register;
};
export = _exports;
export type BaseAdapter = import("./base");
/**
 * Resolve adapter by name
 *
 * @param {object|string} opt
 * @returns {BaseAdapter}
 */
declare function resolve(opt: object | string): BaseAdapter;
/**
 * Register a new Channel Adapter
 * @param {String} name
 * @param {BaseAdapter} value
 */
declare function register(name: string, value: BaseAdapter): void;
