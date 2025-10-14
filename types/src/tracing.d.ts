declare function _exports(): {
    name: string;
    created(_broker: any): void;
    localChannel: (handler: any, chan: any) => any;
};
export = _exports;
