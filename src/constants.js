module.exports = {
	/** Number of redelivery attempts */
	HEADER_REDELIVERED_COUNT: "x-redelivered-count",
	/** Consumer group name */
	HEADER_GROUP: "x-group",

	/** Name of the channel where an error occurred while processing the message */
	HEADER_ORIGINAL_CHANNEL: "x-original-channel",
	/** Name of consumer group that could not process the message properly */
	HEADER_ORIGINAL_GROUP: "x-original-group"
};
