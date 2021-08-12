"use strict";

module.exports = {
	name: "sub2",

	channels: {
		"test.unstable.topic": {
			group: "mygroup",
			handler(msg) {
				this.logger.info("Msg received", msg);
			}
		}
	}
};
