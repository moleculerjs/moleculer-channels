"use strict";

module.exports = {
	name: "sub2",
	channels: {
		DEAD_LETTER: {
			group: "mygroup",
			nats: {
				consumerOpts: {
					deliver_policy: "all"
				}
			},
			handler(msg, raw) {
				this.logger.info("--> FAILED HANDLER <--");
				this.logger.info(msg);
				// Send a notification about the failure

				this.logger.info("--> RAW (ENTIRE) MESSAGE <--");
				this.logger.info(raw);
			}
		}
	}
};
