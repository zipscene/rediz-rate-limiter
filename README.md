# rediz-rate-limiter

Redis-based rate limiting.

## Usage
Rate-limiting is accomplished by creating an instance and calling the `#check`
method, which will increment the ongoing count for the provided key or, if
the limit has been reached, reject with a limit-exceeded error.

Check calls with the same key will be tracked together, regardless of which
process the call was made in, assuming the same redis database is used by
each process.

```js
const RateLimiter = require('rediz-rate-limiter');
const RedizClient = require('rediz');
const pasync = require('pasync');

let client = new RedizClient({ /* redis config */});
let limiter = new RateLimiter(client);


// Check arguments take the form key, rate in Hz, max burst count.
// At most one per 2 seconds.
let check = () => limiter.check('key', { rate: 0.5, burst: 1 });

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
let otherCheck = () => limiter.check('other-key', { rate: 2, burst: 2 });

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
them in redis. An additional prefix can be set by the `RateLimiter` constructor.
Keys with a different prefix will be separated from each other, even if they
are otherwise the same.

```js
let limiter = new RateLimiter(client);
// This instance will prefix keys with 'rzrate:asdf:'
let otherLimiter = new RateLimiter(client, { prefix: 'asdf' });

// First check will resolve
limiter.check(limiter.check('key', { rate: 0.1, burst: 1 }))
	// Second check will also resolve because it has a different prefix.
	.then(otherLimiter.check('key', { rate: 0.1, burst: 1 }))

```

## Default Rate and Burst Count
A default rate and burst count for an instance can be set with the `RateLimiter`
constructor. These will be used if the corresponding options are omitted from
the `check` method.

```js
// At most two per 5 seconds
let limiter = new RateLimiter(client, {
	rate: 0.2
	burst: 2
});

limiter.check('key')
	.then(() =>  limiter.check('key'))
	// Next check will reject
	.then(() =>  limiter.check('key').catch(() => {}));
```

## Multiple Operations Per Check
Using the `opCount` option allows you to specify multiple operations starting
at once. This is useful if you need to limit composite operations that consist
of several smaller operations together, based on the number of smaller
operations. Note that if the collection of ops would cause the burst count to
be exceeded, the check will fail without updating the 'in-progress' count. Thus,
none of the checked operations should be started in this case.

```js
// At most 3 per 5 seconds
let limiter = new RateLimiter(client, {
	rate: 0.2
	burst: 3
});

limiter.check('key', { opCount: 2 })
	.then(() =>  limiter.check('key', { opCount: 2 }))
	// Next check will reject, because 4 ops would exceed the burst of 3.
	.then(() =>  limiter.check('key').catch(() => {}));
```


## Key Expiration
Redis keys created by `rediz-rate-limiter` expire based on the provided
completion rate, since there's no reason to track operations that are
considered finished. This can result in some unexpected behavior, however, if
the rate is changed from one `check` call to the next.

```js
let limiter = new RateLimiter(client);

limiter.check('key', { rate: 1, burst: 1 })
	// Wait 2 seconds
	.then(() => pasync.setTimeout(2000))
	// Will resolve, even though the rate changed to only one per 10 seconds.
	.then(() => limiter.check('key', { rate: 0.1, burst: 1 }));
```
