const path = require('path');
const XError = require('xerror');
const scriptDir = path.resolve(__dirname, '../../resources/lua');

/**
 * Encapsulates communication with redis for keyed rate-limit checks.
 *
 * @class RateLimiter
 * @constructor
 * @param {RedizClient} client - The RedizClient instance used to access redis.
 * @param {Object} [options={}] - instance options
 *   @param {Number} [options.rate] - Default decay rate in Hz.
 *   @param {Number} [options.burst] - Default burst count.
 *   @param {String} [options.prefix] - Redis key prefix.
 */
class RateLimiter {
	constructor(client, options = {}) {
		this.client = client;
		this.rate = options.rate;
		this.burst = options.burst;
		this.prefix = options.prefix;
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
	check(key, rate = this.rate, burst = this.burst) {
		return this._scriptPromise
			.then(() => {
				let prefix = (this.prefix) ? `rzrate:${this.prefix}` : 'rzrate';
				let prefixedKey = `${prefix}:${key}`;
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
