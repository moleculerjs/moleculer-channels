const {
	HEADER_ERROR_MESSAGE,
	HEADER_ERROR_STACK,
	HEADER_ERROR_CODE,
	HEADER_ERROR_TYPE,
	HEADER_ERROR_DATA,
	HEADER_ERROR_NAME,
	HEADER_ERROR_RETRYABLE,
	HEADER_ERROR_TIMESTAMP,
	HEADER_ERROR_PREFIX
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

const parseStringData = str => {
	if (str === "null") return null;
	if (str === "undefined") return undefined;
	if (str === "true") return true;
	if (str === "false") return false;
	const num = Number(str);
	if (!isNaN(num)) return num;
	return str;
};

/**
 * Converts Error object to a plain object
 * @param {any} err
 * @returns {Record<string, string>|null}
 */
const transformErrorToHeaders = err => {
	if (!err) return null;

	let errorHeaders = {
		// primitive properties
		...(err.message ? { [HEADER_ERROR_MESSAGE]: err.message.toString() } : {}),
		...(err.code ? { [HEADER_ERROR_CODE]: err.code.toString() } : {}),
		...(err.type ? { [HEADER_ERROR_TYPE]: err.type.toString() } : {}),
		...(err.name ? { [HEADER_ERROR_NAME]: err.name.toString() } : {}),
		...(typeof err.retryable === "boolean"
			? { [HEADER_ERROR_RETRYABLE]: err.retryable.toString() }
			: {}),

		// complex properties
		// Encode to base64 because of special characters For example, NATS JetStream does not support \n or \r in headers
		...(err.stack ? { [HEADER_ERROR_STACK]: toBase64(err.stack) } : {}),
		...(err.data ? { [HEADER_ERROR_DATA]: toBase64(err.data) } : {})
	};

	if (Object.keys(errorHeaders).length === 0) return null;

	errorHeaders[HEADER_ERROR_TIMESTAMP] = Date.now().toString();

	return errorHeaders;
};

/**
 * Parses error info from headers and attempts to reconstruct original data types
 *
 * @param {Record<string, string>} headers
 * @returns {Record<string, any>}
 */
const transformHeadersToErrorData = headers => {
	if (!headers || typeof headers !== "object") return null;

	const complexPropertiesList = [HEADER_ERROR_STACK, HEADER_ERROR_DATA];

	let errorInfo = {};

	for (let key in headers) {
		if (!key.startsWith(HEADER_ERROR_PREFIX)) continue;

		errorInfo[key] = complexPropertiesList.includes(key)
			? parseBase64(headers[key])
			: (errorInfo[key] = parseStringData(headers[key]));
	}

	return errorInfo;
};

module.exports = {
	transformErrorToHeaders,
	parseBase64,
	toBase64,
	transformHeadersToErrorData
};
