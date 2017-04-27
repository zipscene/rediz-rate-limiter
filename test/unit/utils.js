const utils = require('../../lib/utils');
const sinon = require('sinon');

describe('utils', function() {
	let sandbox;

	beforeEach(function() {
		sandbox = sinon.sandbox.create();
	});

	afterEach(function() {
		sandbox.restore();
	});

	describe('::getNewCount', function() {
		// Rate is in Hz, timePassed is in ms

		it('subtracts one per full period passed, then adds one', function() {
			expect(utils.getNewCount(30, 2, 10000)).to.equal(11);
			expect(utils.getNewCount(10, 0.5, 8765)).to.equal(7);
		});

		it('returns a minimum of 1', function() {
			expect(utils.getNewCount(5, 1, 6000)).to.equal(1);
		});
	});

	describe('::getNewState', function() {
		let now;

		beforeEach(function() {
			now = Date.now();
			sandbox.useFakeTimers(now);
			sandbox.spy(utils, 'getNewCount');
		});

		it('returns new count and timestamp based on provided arguments', function() {
			let state = {
				count: 10,
				timestamp: now - 3000
			};

			let result = utils.getNewState(state, 2);

			expect(utils.getNewCount).to.be.calledOnce;
			expect(utils.getNewCount).to.be.calledWith(state.count, 2, 3000);
			expect(result).to.deep.equal({
				count: utils.getNewCount.firstCall.returnValue,
				timestamp: now
			});
		});

		it('returns new state with count of one if state is null', function() {
			let result = utils.getNewState(null, 2);

			expect(utils.getNewCount).to.not.be.called;
			expect(result).to.deep.equal({
				count: 1,
				timestamp: now
			});
		});
	});
});
