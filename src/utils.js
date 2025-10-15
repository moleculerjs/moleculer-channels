const {
	HEADER_ERROR_MESSAGE,
	HEADER_ERROR_STACK,
	HEADER_ERROR_CODE,
	HEADER_ERROR_TYPE,
	HEADER_ERROR_DATA,
	HEADER_ERROR_NAME,
	HEADER_ERROR_RETRYABLE,
	HEADER_ERROR_TIMESTAMP
} = require("./constants");

/**
 * Converts Error object to a plain object
 * @param {any} err
 * @returns {Object}
 */
const error2ErrorInfoParser = err => {
	return {
		...(err.message ? { [HEADER_ERROR_MESSAGE]: err.message } : {}),
		...(err.stack ? { [HEADER_ERROR_STACK]: err.stack } : {}),
		...(err.code ? { [HEADER_ERROR_CODE]: err.code } : {}),
		...(err.type ? { [HEADER_ERROR_TYPE]: err.type } : {}),
		...(err.data ? { [HEADER_ERROR_DATA]: err.data } : {}),
		...(err.name ? { [HEADER_ERROR_NAME]: err.name } : {}),
		...(err.retryable !== undefined ? { [HEADER_ERROR_RETRYABLE]: err.retryable } : {}),
		[HEADER_ERROR_TIMESTAMP]: Date.now()
	};
};

module.exports = {
	error2ErrorInfoParser
};
