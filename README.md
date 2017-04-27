# rediz-rate-limiter

Redis-based rate limiting.

## Usage
Rate-limiting is accomplished by creating an instance and calling the `#check`
method, which will increment the ongoing count for the provided key or, if
the limit has been reached, reject with a limit-exceeded error.

Check calls with the same key will be tracked together, regardless of which
process the call was made in, assuming the same redis database is used by
each process.

The check method requires a completion rate and burst count with each call.
These can be changed between check calls to the same key, though in practice
they usually should remain the same.

```js
const RateLimiter = require('rediz-rate-limiter');
const RedizClient = require('rediz');
const pasync = require('pasync');

let client = new RedizClient({ /* redis config */});
let limiter = new RateLimiter(client);


// At most one per 2 seconds.
let check = () => limiter.check('key', 0.5, 1);

// First check will resolve.
check()
	// Second check will reject.
	.then(() => check().catch(() => {}))
	// wait 2 seconds.
	.then(() => pasync.setTimeout(2000))
	// Third check will resolve.
	.then(check);


// At most two at once, treating two per second as complete.
// Note that different keys are tracked separately.
let otherCheck = () => limiter.check('other-key', 2, 2);

// First check will resolve.
otherCheck()
	// Second check will resolve.
	.then(otherCheck)
	// Third check will reject.
	.then(() => otherCheck().catch(() => {}))
	// wait 1/2 second.
	.then(() => pasync.setTimeout(500))
	// Fourth check will resolve.
	.then(check);
```

## Custom Prefix
By default, `rediz-rate-limiter` prefixes keys with 'rzrate:' before storing
them in redis. This prefix can be changed with the RateLimiter constructor.
Keys with a different prefix will be separated from each other, even if they
are otherwise the same.

```js
let asdfLimiter = new RateLimiter(client, 'asdf:');

// At most one per 10 seconds.
let asdfCheck = () => asdfLimiter.check('key', 0.1, 1);

// First check will also resolve
check()
	// Second check will also resolve because it has a different prefix.
	.then(check)

```

## Key Expiration
Redis keys created by `rediz-rate-limiter` expire based on the provided
completion rate, since there's no reason to track operations that are
considered finished. This can result in some unexpected behavior, however, if
the rate is changed from one `check` call to the next.

```js
limiter.check('yet-another-key', 1, 1)
	// Wait 2 seconds
	.then(() => pasync.setTimeout(2000))
	// Will resolve, even though the rate changed to only one per 10 seconds.
	.then(() => limiter.check('yet-another-key', 0.1, 1));
```
