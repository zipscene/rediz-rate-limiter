/**
 * Rate-limiting utility functions.
 *
 * @class utils
 * @private
 * @static
 */

/**
 * Calculates the next operation count, assuming one new operation as well
 * as a provided decay rate and amount of time passsed.
 *
 * @method getNewCount
 * @static
 * @param {Number} count - Current operation count
 * @param {Number} rate - Decay rate in Hz
 * @param {Number} timePassed - Time passed since last update, in ms.
 * @return {Number} - Updated count
 */
exports.getNewCount = function(count, rate, timePassed) {
	let periodsPassed = Math.floor(timePassed * (rate / 1000));
	return Math.max(count - periodsPassed, 0) + 1;
};

/**
 * Updates the provided state object it to account for another operation,
 * according to the current timestamp and the provided decay rate.
 *
 * @method @getNewState
 * @static
 * @param {Object|Null} state - Plain object with 'count' and 'timestamp'
 *   properties, or null if there is no current state.
 * @param {Number} rate - Decay rate in Hz.
 * @return {Object} - Updated state object. If a null state was provided, a
 *   new state with a count of 1 will be returned.
 */
exports.getNewState = function(state, rate) {
	let now = Date.now();
	return {
		count: (state) ? exports.getNewCount(state.count, rate, now - state.timestamp) : 1,
		timestamp: now
	};
};
