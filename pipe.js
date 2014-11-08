var inherits = require('util').inherits;
var Transform = require('stream').Transform;
var Readable = require('stream').Readable;

var ShellJoin = require('./shell/Join.js').Join;
var ShellSort = require('./shell/Sort.js').Sort;

function JP() {

};

JP.prototype._wrapStream = function(stream) {
	return stream;
};

JP.prototype.map = function(cb) {
	var transform = new (require('stream').Transform)({objectMode: true});

	transform._transform = function(items, encoding, callback) {
		var out = [];

		for(var i = 0; i < items.length; i++)
			out.push(cb(items[i]));

		if(items.length)
			this.push(out);

		callback();
	};

	return this._wrapStream(transform);
};

JP.prototype.filter = function(cb) {
	var transform = new (require('stream').Transform)({objectMode: true});

	transform._transform = function(items, encoding, callback) {
		var out = [];

		for(var i = 0; i < items.length; i++) {
			if(cb(items[i]))
				out.push(items[i]);
		}

		if(items.length)
			this.push(out);

		callback();
	};

	return this._wrapStream(transform);
};

JP.prototype.splitLines = function(ending) {
	if(ending === undefined)
		ending = '\n';

	var tail = '';

	var transform = new (require('stream').Transform)({objectMode: true});

	transform._transform = function(buf, encoding, callback) {
		var lines = buf.toString().split(ending);

		var bucket = [];

		if(lines.length > 1) {
			bucket.push(tail + lines[0]);

			for(var i = 1; i < lines.length - 1; i++) {
				bucket.push(lines[i]);
			}

			tail = lines[lines.length - 1];
		} else {
			tail += lines[lines.length - 1];
		}

		if(bucket.length)
			this.push(bucket);

		callback();
	};

	transform._flush = function(callback) {
		if(tail.length) {
			this.push([tail]);
			tail = '';
		}

		callback();
	};

	return this._wrapStream(transform);
};

JP.prototype.joinLines = function(ending) {
	if(ending === undefined)
		ending = '\n';

	var transform = new (require('stream').Transform)({objectMode: true});
	transform._transform = function(lines, encoding, callback) {
		if(lines.length)
			this.push(lines.join('\n') + '\n');

		callback();
	};

	return this._wrapStream(transform);
};

JP.prototype.sort = function(streams, keyCb) {
	var pipes = [];
	var separator = '\t';

	for(var i = 0; i < streams.length; i++) {
		var s = streams[i].pipe(this.map(function(item) {
			var key = keyCb(item);

			return JSON.stringify(key) + separator + JSON.stringify(item);
		}))
		.pipe(this.joinLines());

		pipes.push(s);
	}

	var sort = new ShellSort(pipes, {
		separator: separator,
		key: '1,1',
		tmpDir: '/mnt/hd/tmp',
		compress: 'lzop',
		bufferSize: 1024*1024*128
	});

	return sort.pipe(this.splitLines())
		.pipe(this.map(function(line) {
			var sep = line.indexOf(separator);

			var json = line.substr(sep + 1);

			return JSON.parse(' ' + json);
		})
	);
};

var jp = new JP;

var p = process.stdin
	.pipe(jp.splitLines())
	.pipe(jp.map(JSON.parse))
	.pipe(jp.map(function(item) {
		return {
			uid: item.uid,
			type: item.type
		};
	}))
;

var sort = jp.sort([p], function(item) {
	return item.uid;
});

sort.pipe(jp.map(JSON.stringify))
.pipe(jp.joinLines())
.pipe(process.stdout)
;