const RateLimiter = require('../../lib/rate-limiter');
const sinon = require('sinon');
const RedizClient = require('rediz');
const pasync = require('pasync');
const path = require('path');
const XError = require('xerror');
const scriptDir = path.resolve(__dirname, '../../../resources/lua');

describe('RateLimiter', function() {
	let client, sandbox, scriptWaiter;

	beforeEach(function() {
		client = sinon.createStubInstance(RedizClient);
		sandbox = sinon.sandbox.create();

		scriptWaiter = pasync.waiter();
		client.registerScriptDir.returns(scriptWaiter.promise);
	});

	afterEach(function() {
		sandbox.restore();
	});

	it('stores provided rediz client and options', function() {
		let options = {
			rate: 0.5,
			burst: 2,
			prefix: 'prefix'
		};

		let rateLimiter = new RateLimiter(client, options);

		expect(rateLimiter.client).to.equal(client);
		expect(rateLimiter.prefix).to.equal(options.prefix);
		expect(rateLimiter.rate).to.equal(options.rate);
		expect(rateLimiter.burst).to.equal(options.burst);
	});

	it('registers lua script dir with client', function() {
		let rateLimiter = new RateLimiter(client); // eslint-disable-line no-unused-vars

		expect(client.registerScriptDir).to.be.calledOnce;
		expect(client.registerScriptDir).to.be.calledOn(client);
		expect(client.registerScriptDir).to.be.calledWith(scriptDir);
	});

	describe('#check', function() {
		const key = 'some-key';
		let rateLimiter;

		beforeEach(function() {
			rateLimiter = new RateLimiter(client, {
				rate: 1,
				burst: 3
			});
		});

		context('script dir registration successful', function() {
			const now = Date.now();
			let shard;

			beforeEach(function() {
				scriptWaiter.resolve();
				shard = { runScript: () => {} };
				client.shard.returns(shard);
				sandbox.useFakeTimers(now);
				sinon.stub(shard, 'runScript').resolves(1);
			});

			it('runs rateCheck script on appropriate shard', function() {
				const rate = 0.5;
				const burst = 2;

				return rateLimiter.check(key, rate, burst)
					.then(() => {
						expect(client.shard).to.be.calledOnce;
						expect(client.shard).to.be.calledOn(client);
						expect(client.shard).to.be.calledWithExactly(key);
						expect(shard.runScript).to.be.calledOnce;
						expect(shard.runScript).to.be.calledOn(shard);
						expect(shard.runScript).to.be.calledWith(
							'rateCheck',
							`rzrate:${key}:count`,
							`rzrate:${key}:timestamp`,
							now,
							rate,
							burst
						);
					});
			});

			it('uses instance rate and burst if none are provided', function() {
				return rateLimiter.check(key)
					.then(() => {
						expect(client.shard).to.be.calledOnce;
						expect(client.shard).to.be.calledOn(client);
						expect(client.shard).to.be.calledWithExactly(key);
						expect(shard.runScript).to.be.calledOnce;
						expect(shard.runScript).to.be.calledOn(shard);
						expect(shard.runScript).to.be.calledWith(
							'rateCheck',
							`rzrate:${key}:count`,
							`rzrate:${key}:timestamp`,
							now,
							rateLimiter.rate,
							rateLimiter.burst
						);
					});
			});

			it('prepends prefix to keys, if set', function() {
				const rate = 0.25;
				const burst = 1;
				rateLimiter.prefix = 'prefix';

				return rateLimiter.check(key, rate, burst)
					.then(() => {
						expect(client.shard).to.be.calledOnce;
						expect(client.shard).to.be.calledOn(client);
						expect(client.shard).to.be.calledWithExactly(key);
						expect(shard.runScript).to.be.calledOnce;
						expect(shard.runScript).to.be.calledOn(shard);
						expect(shard.runScript).to.be.calledWith(
							'rateCheck',
							`rzrate:${rateLimiter.prefix}:${key}:count`,
							`rzrate:${rateLimiter.prefix}:${key}:timestamp`,
							now,
							rate,
							burst
						);
					});
			});

			it('rejects if rateCheck script results in 0', function() {
				shard.runScript.resolves(0);

				return rateLimiter.check(key)
					.then(() => {
						throw new Error('Promise should have rejected');
					}, (err) => {
						expect(err).to.be.an.instanceof(XError);
						expect(err.code).to.equal(XError.LIMIT_EXCEEDED);
					});
			});
		});

		context('failed to register script dir', function() {
			it('rejects with registration error', function() {
				let registrationError = new Error('some registration error');
				scriptWaiter.reject(registrationError);

				return rateLimiter.check(key)
					.then(() => {
						throw new Error('Promise should have rejected');
					}, (err) => {
						expect(err).to.equal(registrationError);
					});
			});
		});
	});
});
