var p = require('child_process').spawn(
	'pv',
	['-L', 1024],
	{
		stdio: [
			'pipe',
			'pipe',
			process.stderr
		]
	}
);

var unserialize = new (require('stream').Transform)({objectMode: true, highWaterMark: 128});
unserialize._transform = function(chunk, encoding, callback) {
	console.error(this.push({data: chunk}));

	callback();
};

var serialize = new (require('stream').Transform)({objectMode: true, highWaterMark: 128});
serialize._transform = function(chunk, encoding, callback) {
	this.push(chunk.data);

	callback();
};

process.stdin
	.pipe(unserialize)
	.pipe(serialize)
	.pipe(p.stdin)
	.pipe(process.stdout)
;
