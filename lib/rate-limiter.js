const XError = require('xerror');
const utils = require('./utils');

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
		return this._getNewState(key, rate)
			.then((newState) => {
				if (newState.count > burst) throw new XError(XError.LIMIT_EXCEEDED);
				return this._writeState(key, newState, rate);
			});
	}

	/**
	 * Reqests the current state for the provided key from redis and
	 * updates it to account for another operation, according to the current
	 * timestamp and the provided rate.
	 *
	 * @method _getNewState
	 * @private
	 * @param {String} key
	 * @param {Number} rate
	 * @return {Promise{Object}} - Resolves with a a plain object with 'count'
	 *   and 'timestamp' properties.
	 */
	_getNewState(key, rate) {
		return this._readState(key)
			.then((state) => utils.getNewState(state, rate));
	}

	/**
	 * Requests the current state for the provided key from redis.
	 *
	 * @method _readState
	 * @private
	 * @param {String} key
	 * @return {Promise{Object|Null}} - Resolves with a a plain object with
	 *   'count' and 'timestamp' properties, or null if there is no state
	 *   stored in redis.
	 */
	_readState(key) {
		return this.client.hmget(this.prefix + key, 'count', 'timestamp')
			.then(([ count, timestamp ]) => {
				if (!count || !timestamp) return null;
				return {
					count: parseInt(count, 10),
					timestamp: parseInt(timestamp, 10)
				};
			});
	}

	/**
	 * Writes the provided state for the provided key to redis. The redis
	 * entry will be set to expire on the next full second after the count
	 * has dropped to zero, based on the provided rate of decay.
	 *
	 * @method _writeState
	 * @private
	 * @param {String} key
	 * @param {Object} state - Plain object with 'count' and 'timestamp' properties.
	 * @param {Number} rate
	 * @return {Promise} - Resolves when the operation is complete.
	 */
	_writeState(key, state, rate) {
		let redisKey = this.prefix + key;
		let ttl = Math.ceil(state.count / rate);
		return this.client.hmset(
			redisKey,
			'count', state.count,
			'timestamp', state.timestamp
		)
			.then(() => this.client.expire(redisKey, ttl));
	}
}

module.exports = RateLimiter;
