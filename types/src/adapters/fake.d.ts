export = FakeAdapter;
/**
 * @typedef {import("moleculer").ServiceBroker} ServiceBroker Moleculer Service Broker instance
 * @typedef {import("moleculer").Context} Context Context instance
 * @typedef {import("moleculer").Service} Service Service instance
 * @typedef {import("moleculer").LoggerInstance} Logger Logger instance
 * @typedef {import("../index").Channel} Channel Base channel definition
 * @typedef {import("./base").BaseDefaultOptions} BaseDefaultOptions Base adapter options
 */
/**
 * @typedef {Object} FakeOptions Fake Adapter configuration
 * @property {Number} servicePrefix Prefix for service names
 * @property {Number} eventPrefix Prefix for event names
 */
/**
 * Fake (Moleculer Event-based) adapter
 *
 * @class FakeAdapter
 * @extends {BaseAdapter}
 */
declare class FakeAdapter extends BaseAdapter {
    /** @type {FakeOptions & BaseDefaultOptions} */
    opts: FakeOptions & BaseDefaultOptions;
    services: Map<any, any>;
    stopping: boolean;
    /**
     * Process incoming messages.
     *
     * @param {Channel} chan
     * @param {Context} ctx
     */
    processMessage(chan: Channel, ctx: Context): Promise<void>;
    /**
     * Publish a payload to a channel.
     *
     * @param {String} channelName
     * @param {any} payload
     * @param {Object?} opts
     */
    publish(channelName: string, payload: any, opts?: any | null): Promise<void>;
}
declare namespace FakeAdapter {
    export { ServiceBroker, Context, Service, Logger, Channel, BaseDefaultOptions, FakeOptions };
}
import BaseAdapter = require("./base");
/**
 * Fake Adapter configuration
 */
type FakeOptions = {
    /**
     * Prefix for service names
     */
    servicePrefix: number;
    /**
     * Prefix for event names
     */
    eventPrefix: number;
};
/**
 * Base adapter options
 */
type BaseDefaultOptions = import("./base").BaseDefaultOptions;
/**
 * Base channel definition
 */
type Channel = import("../index").Channel;
/**
 * Context instance
 */
type Context = import("moleculer").Context;
/**
 * Moleculer Service Broker instance
 */
type ServiceBroker = import("moleculer").ServiceBroker;
/**
 * Service instance
 */
type Service = import("moleculer").Service;
/**
 * Logger instance
 */
type Logger = import("moleculer").LoggerInstance;
