
var jl = {};

jl
	.from(process.stdin)
	.select({
		sum: jl.SUM(r.value),
		count: jl.COUNT()
	})
	.where(function(item) {
		return item.ts > 1234567890;
	})
	.group('uid')
;
