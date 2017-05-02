local numKeyArgs = 2

-- Arguments:
-- Keys: <CountKey>, <TimestampKey>
-- Params: <NewTimestamp>, <Rate>, <Burst>
-- Returns:
-- 0 - Rate check failed, limit exceeded
-- 1 - Rate check passed, count and timestamp were updated

local count = tonumber(redis.call("get", KEYS[1]));
local timestamp = tonumber(redis.call('get', KEYS[2]));
local newTimestamp = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local burst = tonumber(ARGV[3])

if count and timestamp then
	local timePassed = math.max(newTimestamp - timestamp, 0)
	local periodsPassed = math.floor(timePassed * (rate / 1000))
	count = math.max(count - periodsPassed, 0) + 1
else
	count = 1
end

if count > burst then
	return 0
else
	local ttl = math.ceil(count / rate)
	redis.call('set', KEYS[1], count, 'EX', ttl)
	redis.call('set', KEYS[2], newTimestamp, 'EX', ttl)
	return 1
end
