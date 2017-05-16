const RateLimiter = require('../../lib');
const RedizClient = require('rediz');
const pasync = require('pasync');
const XError = require('xerror');

describe('RateLimiter', function() {
	let client, rateLimiter, keyPattern;

	beforeEach(function() {
		client = new RedizClient({
			host: 'localhost',
			port: 6379,
			volatileCluster: false
		});

		rateLimiter = new RateLimiter(client, {
			prefix: 'test',
			rate: 10,
			burst: 3
		});

		keyPattern = `rzrate:${rateLimiter.prefix}:*`;
	});

	afterEach(function() {
		return client.keys(keyPattern)
			.then((keys) => {
				if (keys.length) return client.del(...keys);
			});
	});

	it('allows checks up to burst count', function() {
		let check = () => rateLimiter.check('some-key', {
			rate: 0.1,
			burst: 2
		});

		return pasync.timesSeries(2, check)
			.then(() => testRejection(check));
	});

	it('supports multiple operations per check', function() {
		let check = () => rateLimiter.check('some-key', {
			rate: 0.1,
			burst: 3,
			opCount: 2
		});

		return check()
			.then(() => testRejection(check));
	});

	it('decays count at provided rate', function() {
		let check = () => rateLimiter.check('some-key');

		// Check three times.
		return pasync.timesSeries(3, check)
			// Next check should reject.
			.then(() => testRejection(check))
			// Wait for count to decay once.
			.then(() => pasync.setTimeout(100))
			// Check once.
			.then(check)
			// Next check should reject.
			.then(() => testRejection(check))
			// Wait for count to decay twice.
			.then(() => pasync.setTimeout(200))
			// Check twice.
			.then(() => pasync.timesSeries(2, check))
			// Next check should reject.
			.then(() => testRejection(check));
	});

	it('tracks different keys separately', function() {
		let check = () => rateLimiter.check('some-key');
		let otherCheck = () => rateLimiter.check('other-key');

		// Max out check.
		return pasync.timesSeries(3, check)
			// Allow check to decay once.
			.then(() => pasync.setTimeout(100))
			// Max out otherCheck.
			.then(() => pasync.timesSeries(3, otherCheck))
			// Let both checks decay once.
			.then(() => pasync.setTimeout(100))
			// Max out check again.
			.then(() => pasync.timesSeries(2, check))
			// Next check should reject.
			.then(() => testRejection(check))
			// Max out otherCheck again.
			.then(otherCheck)
			// Next otherCheck should reject.
			.then(() => testRejection(otherCheck));
	});

	it('expires redis keys after count has fully decayed', function() {
		this.timeout(4000);
		let check = () => rateLimiter.check('some-key', {
			rate: 1,
			burst: 3
		});

		return pasync.timesSeries(3, check)
			.then(() => pasync.setTimeout(3000))
			.then(() => client.keys(keyPattern))
			.then((keys) => {
				expect(keys).to.be.empty;
			});
	});
});

function testRejection(check) {
	return check()
		.then(() => {
			throw new Error('Promise should have rejected');
		}, (err) => {
			expect(err).to.be.an.instanceof(XError);
			expect(err.code).to.equal(XError.LIMIT_EXCEEDED);
		});
}
