const path = require('path');
const XError = require('xerror');
const scriptDir = path.resolve(__dirname, '../../resources/lua');

/**
 * Encapsulates communication with redis for keyed rate-limit checks.
 *
 * @class RateLimiter
 * @constructor
 * @param {RedizClient} client - The RedizClient instance used to access redis.
 * @param {String} [prefix='rzrate:'] - Redis key prefix.
 */
class RateLimiter {
	constructor(client, prefix = 'rzrate:') {
		this.client = client;
		this.prefix = prefix;
		this._scriptPromise = this.client.registerScriptDir(scriptDir);
	}

	/**
	 * Checks if the limit has been reached for the provided key and, if
	 * not, updates tracking info in redis to account for one more operation.
	 *
	 * @method check
	 * @param {String} key - Operation tracking id.
	 * @param {Number} rate - Rate at which operations are considered to be
	 *   'completed', in Hz.
	 * @param {Number} burst - Maximum number of 'simultaneous' operations.
	 * @return {Promise} - Resolves if the check is successful. Rejects if
	 *   the limit would be exceeded, or if the check could not be completed
	 *   due to a redis error.
	 */
	check(key, rate, burst) {
		return this._scriptPromise
			.then(() => {
				let prefixedKey = this.prefix + key;
				let shard = this.client.shard(key);
				return shard.runScript(
					'rateCheck',
					`${prefixedKey}:count`,
					`${prefixedKey}:timestamp`,
					Date.now(),
					rate,
					burst
				);
			})
			.then((success) => {
				if (!success) throw new XError(XError.LIMIT_EXCEEDED);
			});
	}
}

module.exports = RateLimiter;
