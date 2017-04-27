const RateLimiter = require('../../lib');
const RedizClient = require('rediz');
const pasync = require('pasync');
const XError = require('xerror');

describe('RateLimiter', function() {
	let client, rateLimiter;

	beforeEach(function() {
		client = new RedizClient({
			host: 'localhost',
			port: 6379,
			volatileCluster: false
		});

		rateLimiter = new RateLimiter(client, 'rsratetest:');
	});

	afterEach(function() {
		return client.keys(rateLimiter.prefix + '*')
			.then((keys) => {
				if (keys.length) return client.del(...keys);
			});
	});

	it('allows checks up to burst count', function() {
		let check = () => rateLimiter.check('some-key', 0.1, 2);

		return pasync.timesSeries(2, check)
			.then(() => testRejection(check));
	});

	it('decays count at provided rate', function() {
		let check = () => rateLimiter.check('some-key', 10, 3);

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
		let check = () => rateLimiter.check('some-key', 10, 2);
		let otherCheck = () => rateLimiter.check('other-key', 10, 2);

		// Max out check.
		return pasync.timesSeries(2, check)
			// Allow check to decay once.
			.then(() => pasync.setTimeout(100))
			// Max out otherCheck.
			.then(() => pasync.timesSeries(2, otherCheck))
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
		let check = () => rateLimiter.check('some-key', 1, 3);

		return pasync.timesSeries(3, check)
			.then(() => pasync.setTimeout(3000))
			.then(() => client.keys(rateLimiter.prefix + '*'))
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
