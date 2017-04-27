exports.getNewCount = function(count, rate, timePassed) {
	let periodsPassed = Math.floor(timePassed * (rate / 1000));
	return Math.max(count - periodsPassed, 0) + 1;
};

exports.getNewState = function(state, rate) {
	let now = Date.now();
	return {
		count: (state) ? exports.getNewCount(state.count, rate, now - state.timestamp) : 1,
		timestamp: now
	};
};
