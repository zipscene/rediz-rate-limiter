const XError = require('xerror');
const utils = require('./utils');

class RateLimiter {
	constructor(client, prefix = 'rzrate:') {
		this.client = client;
		this.prefix = prefix;
	}

	check(key, rate, burst) {
		return this._getNewState(key, rate)
			.then((newState) => {
				if (newState.count > burst) throw new XError(XError.LIMIT_EXCEEDED);
				return this._writeState(key, newState, rate);
			});
	}

	_getNewState(key, rate) {
		return this._readState(key)
			.then((state) => utils.getNewState(state, rate));
	}

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
