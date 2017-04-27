const RateLimiter = require('../../lib/rate-limiter');
const sinon = require('sinon');
const RedizClient = require('rediz');
const XError = require('xerror');
const utils = require('../../lib/utils');

describe('RateLimiter', function() {
	let client, sandbox;

	beforeEach(function() {
		client = sinon.createStubInstance(RedizClient);
		sandbox = sinon.sandbox.create();
	});

	afterEach(function() {
		sandbox.restore();
	});

	it('stores provided rediz client and prefix', function() {
		let prefix = 'prefix';

		let rateLimiter = new RateLimiter(client, prefix);

		expect(rateLimiter.client).to.equal(client);
		expect(rateLimiter.prefix).to.equal(prefix);
	});

	it('uses "rzrate:" as default prefix', function() {
		let rateLimiter = new RateLimiter(client);

		expect(rateLimiter.prefix).to.equal('rzrate:');
	});

	describe('#check', function() {
		const key = 'some-key';
		const rate = 0.5;
		let rateLimiter, newState, writeComplete;

		beforeEach(function() {
			rateLimiter = new RateLimiter(client);

			newState = { count: 10, timestamp: Date.now() };
			sinon.stub(rateLimiter, '_getNewState').resolves(newState);

			writeComplete = false;
			sinon.stub(rateLimiter, '_writeState').callsFake(() => {
				return new Promise((resolve) => {
					setImmediate(() => {
						writeComplete = true;
						resolve();
					});
				});
			});
		});

		it('writes new state if new count is less than burst', function() {
			return rateLimiter.check(key, rate, 11)
				.then(() => {
					expect(rateLimiter._getNewState).to.be.calledOnce;
					expect(rateLimiter._getNewState).to.be.calledOn(rateLimiter);
					expect(rateLimiter._getNewState).to.be.calledWith(key, rate);
					expect(rateLimiter._writeState).to.be.calledOnce;
					expect(rateLimiter._writeState).to.be.calledOn(rateLimiter);
					expect(rateLimiter._writeState).to.be.calledWith(key, newState, rate);
					expect(writeComplete).to.be.true;
				});
		});

		it('writes new state if new count is equal to burst', function() {
			return rateLimiter.check(key, rate, 10)
				.then(() => {
					expect(rateLimiter._writeState).to.be.calledOnce;
					expect(rateLimiter._writeState).to.be.calledOn(rateLimiter);
					expect(rateLimiter._writeState).to.be.calledWith(key, newState, rate);
					expect(writeComplete).to.be.true;
				});
		});

		it('rejects without writing if new count is greater than burst', function() {
			return rateLimiter.check(key, rate, 9)
				.then(() => {
					throw new Error('Promise should have been rejected');
				}, (err) => {
					expect(rateLimiter._writeState).to.not.be.called;
					expect(err).to.be.an.instanceof(XError);
					expect(err.code).to.equal(XError.LIMIT_EXCEEDED);
				});
		});
	});

	describe('#_getNewState', function() {
		it('reads the state and passes it through utils::getNewState', function() {
			let rateLimiter = new RateLimiter(client);
			let key = 'some-key';
			let rate = 0.5;
			let state = { count: 10, timestamp: Date.now() - 4000 };
			sinon.stub(rateLimiter, '_readState').resolves(state);
			sandbox.spy(utils, 'getNewState');

			return rateLimiter._getNewState(key, rate)
				.then((result) => {
					expect(rateLimiter._readState).to.be.calledOnce;
					expect(rateLimiter._readState).to.be.calledOn(rateLimiter);
					expect(rateLimiter._readState).to.be.calledWith(key);
					expect(utils.getNewState).to.be.calledOnce;
					expect(utils.getNewState).to.be.calledOn(utils);
					expect(utils.getNewState).to.be.calledWith(state, rate);
					expect(result).to.equal(utils.getNewState.firstCall.returnValue);
				});
		});
	});

	describe('#_readState', function() {
		let rateLimiter, key;

		beforeEach(function() {
			rateLimiter = new RateLimiter(client, 'prefix:');
			key = 'some-key';
		});

		it('gets parsed count and timestamp from redis', function() {
			let count = 20;
			let timestamp = 12345;
			client.hmget.resolves([ `${count}`, `${timestamp}` ]);

			return rateLimiter._readState(key)
				.then((result) => {
					expect(client.hmget).to.be.calledOnce;
					expect(client.hmget).to.be.calledOn(client);
					expect(client.hmget).to.be.calledWith(
						rateLimiter.prefix + key,
						'count',
						'timestamp'
					);
					expect(result).to.deep.equal({ count, timestamp });
				});
		});

		it('resolves with null if count is not set for key', function() {
			client.hmget.resolves([ null, '12345' ]);

			return rateLimiter._readState(key)
				.then((result) => {
					expect(result).to.be.null;
				});
		});

		it('resolves with null if timestamp is not set for key', function() {
			client.hmget.resolves([ '20', null ]);

			return rateLimiter._readState(key)
				.then((result) => {
					expect(result).to.be.null;
				});
		});
	});

	describe('#_writeState', function() {
		it('writes state to redis with appropriate expiration timer', function() {
			let rateLimiter = new RateLimiter(client, 'prefix:');
			let key = 'some-key';
			let state = {
				count: 25,
				timestamp: 12345
			};
			let rate = 2;
			let hmsetComplete = false;
			let expireComplete = false;
			client.hmset.callsFake(() => new Promise((resolve) => {
				setImmediate(() => {
					hmsetComplete = true;
					resolve();
				});
			}));
			client.expire.callsFake(() => {
				if (!hmsetComplete) throw new Error('hmset not yet complete');
				return new Promise((resolve) => {
					setImmediate(() => {
						expireComplete = true;
						resolve();
					});
				});
			});

			return rateLimiter._writeState(key, state, rate)
				.then(() => {
					expect(client.hmset).to.be.calledOnce;
					expect(client.hmset).to.be.calledOn(client);
					expect(client.hmset).to.be.calledWith(
						rateLimiter.prefix + key,
						'count',
						state.count,
						'timestamp',
						state.timestamp
					);
					expect(client.expire).to.be.calledOnce;
					expect(client.expire).to.be.calledOn(client);
					expect(client.expire).to.be.calledWith(
						rateLimiter.prefix + key,
						13
					);
					expect(expireComplete).to.be.true;
				});
		});
	});
});
