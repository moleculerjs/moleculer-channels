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
 * @returns {Record<string, string>|null}
 */
const error2ErrorInfoParser = err => {
	if (!err) return null;

	let errorHeaders = {
		...(err.message ? { [HEADER_ERROR_MESSAGE]: err.message } : {}),
		...(err.stack ? { [HEADER_ERROR_STACK]: err.stack } : {}),
		...(err.code ? { [HEADER_ERROR_CODE]: err.code } : {}),
		...(err.type ? { [HEADER_ERROR_TYPE]: err.type } : {}),
		...(err.data ? { [HEADER_ERROR_DATA]: err.data } : {}),
		...(err.name ? { [HEADER_ERROR_NAME]: err.name } : {}),
		...(err.retryable !== undefined ? { [HEADER_ERROR_RETRYABLE]: err.retryable } : {})
	};

	if (Object.keys(errorHeaders).length === 0) return null;

	errorHeaders[HEADER_ERROR_TIMESTAMP] = Date.now();

	// Encode to base64 because of special characters For example, NATS JetStream does not support \n or \r in headers
	Object.keys(errorHeaders).forEach(key => (errorHeaders[key] = toBase64(errorHeaders[key])));

	return errorHeaders;
};

module.exports = {
	error2ErrorInfoParser,
	parseBase64,
	toBase64
};
