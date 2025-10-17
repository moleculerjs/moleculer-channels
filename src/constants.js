module.exports = {
	/** Number of redelivery attempts */
	HEADER_REDELIVERED_COUNT: "x-redelivered-count",
	/** Consumer group name */
	HEADER_GROUP: "x-group",

	/** Name of the channel where an error occurred while processing the message */
	HEADER_ORIGINAL_CHANNEL: "x-original-channel",
	/** Name of consumer group that could not process the message properly */
	HEADER_ORIGINAL_GROUP: "x-original-group",

	/** Error message */
	HEADER_ERROR_MESSAGE: "x-error-message",
	/** Error code */
	HEADER_ERROR_CODE: "x-error-code",
	/** Error stack trace */
	HEADER_ERROR_STACK: "x-error-stack",
	/** Error type */
	HEADER_ERROR_TYPE: "x-error-type",
	/** Error data */
	HEADER_ERROR_DATA: "x-error-data",
	/** Error name */
	HEADER_ERROR_NAME: "x-error-name",
	/** Error retryable */
	HEADER_ERROR_RETRYABLE: "x-error-retryable",
	/** Timestamp when the error happened */
	HEADER_ERROR_TIMESTAMP: "x-error-timestamp",

	METRIC_CHANNELS_MESSAGES_SENT: "moleculer.channels.messages.sent",
	METRIC_CHANNELS_MESSAGES_TOTAL: "moleculer.channels.messages.total",
	METRIC_CHANNELS_MESSAGES_ACTIVE: "moleculer.channels.messages.active",
	METRIC_CHANNELS_MESSAGES_TIME: "moleculer.channels.messages.time",

	METRIC_CHANNELS_MESSAGES_ERRORS_TOTAL: "moleculer.channels.messages.errors.total",
	METRIC_CHANNELS_MESSAGES_RETRIES_TOTAL: "moleculer.channels.messages.retries.total",
	METRIC_CHANNELS_MESSAGES_DEAD_LETTERING_TOTAL:
		"moleculer.channels.messages.deadLettering.total",

	/**
	 * Thrown when incoming messages cannot be deserialized
	 * More context: https://github.com/moleculerjs/moleculer-channels/issues/76
	 */
	INVALID_MESSAGE_SERIALIZATION_ERROR_CODE: "INVALID_MESSAGE_SERIALIZATION",

	/**
	 * Thrown when outgoing messages cannot be serialized
	 */
	SERIALIZER_FAILED_ERROR_CODE: "SERIALIZER_FAILED"
};
