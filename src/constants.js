module.exports = {
	/** Number of redelivery attempts */
	HEADER_REDELIVERED_COUNT: "x-redelivered-count",
	/** Consumer group name */
	HEADER_GROUP: "x-group",

	/** Name of the channel where an error occurred while processing the message */
	HEADER_ORIGINAL_CHANNEL: "x-original-channel",
	/** Name of consumer group that could not process the message properly */
	HEADER_ORIGINAL_GROUP: "x-original-group",

	METRIC_CHANNELS_MESSAGES_SENT: "moleculer.channels.messages.sent",
	METRIC_CHANNELS_MESSAGES_TOTAL: "moleculer.channels.messages.total",
	METRIC_CHANNELS_MESSAGES_ACTIVE: "moleculer.channels.messages.active",
	METRIC_CHANNELS_MESSAGES_TIME: "moleculer.channels.messages.time",

	METRIC_CHANNELS_MESSAGES_ERRORS_TOTAL: "moleculer.channels.messages.errors.total",
	METRIC_CHANNELS_MESSAGES_RETRIES_TOTAL: "moleculer.channels.messages.retries.total",
	METRIC_CHANNELS_MESSAGES_DEAD_LETTERING_TOTAL: "moleculer.channels.messages.deadLettering.total"
};
