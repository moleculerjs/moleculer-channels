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

const strToBase64 = str => Buffer.from(str).toString("base64");
const fromBase64ToStr = str => Buffer.from(str, "base64").toString("utf-8");

/**
 * Converts data to base64 string
 *
 * @param {Object|number|string|boolean} data
 * @returns {string}
 */
const toBase64 = data => {
	if (typeof data === "string") return strToBase64(data);

	if (typeof data === "object") return strToBase64(JSON.stringify(data));
	if (typeof data === "number") return strToBase64(data.toString());
	if (typeof data === "boolean") return strToBase64(data ? "true" : "false");

	throw new Error("Unsupported data type");
};

/**
 * Parses base64 string to original data type (Object, number, string, boolean)
 *
 * @param {string} b64str
 * @returns {Object|number|string|boolean}
 */
const parseBase64 = b64str => {
	const str = fromBase64ToStr(b64str);
	try {
		return JSON.parse(str);
	} catch {
		if (str === "true") return true;
		if (str === "false") return false;
		const num = Number(str);
		if (!isNaN(num)) return num;
		return str;
	}
};

/**
 * Converts Error object to a plain object
 * @param {any} err
 * @returns {Object}
 */
const error2ErrorInfoParser = err => {
	if (!err) return null;

	return {
		// Encode to base64 to support special characters. For example, NATS JetStream does not support \n or \r in headers
		...(err.message ? { [HEADER_ERROR_MESSAGE]: toBase64(err.message) } : {}),
		...(err.stack ? { [HEADER_ERROR_STACK]: toBase64(err.stack) } : {}),
		...(err.code ? { [HEADER_ERROR_CODE]: toBase64(err.code) } : {}),
		...(err.type ? { [HEADER_ERROR_TYPE]: toBase64(err.type) } : {}),
		...(err.data ? { [HEADER_ERROR_DATA]: toBase64(err.data) } : {}),
		...(err.name ? { [HEADER_ERROR_NAME]: toBase64(err.name) } : {}),
		...(err.retryable !== undefined
			? { [HEADER_ERROR_RETRYABLE]: toBase64(err.retryable) }
			: {}),
		[HEADER_ERROR_TIMESTAMP]: toBase64(Date.now())
	};
};

module.exports = {
	error2ErrorInfoParser,
	parseBase64,
	toBase64
};
