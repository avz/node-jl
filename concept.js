function AStream() {
	throw new Error('abstract');
};

// input
AStream.prototype.in = function(item) {
	this._in(item, this.onOut);
};

AStream.prototype.end = function() {
	this.onEnd();
};

AStream.prototype._in = function(item, resultCb) {
	resultCb(item);
};

// output handler
AStream.prototype.onOut = function(item) {
};

// end handler
AStream.prototype.onEnd = function() {
};

AStream.prototype._chain = function(cb) {
	var lastHandler = this._in;

	this._in = function(item, onResult) {
		/*
		 * создание функции на каждой итерации сильно тормозит.
		 * подумать как избавиться
		 */
		lastHandler(item, function(item) {
			cb(item, onResult);
		});
	};

	return this;
};

function TextStream() {
}

require('util').inherits(TextStream, AStream);

TextStream.prototype.splitLines = function() {
	var stream = new LinesStream;
	var delimiter = '\n';

	var lastString = '';

	this.onOut = function(buf) {
		var lines = buf.toString().split(delimiter);

		if(lines.length > 1) {
			stream.in(lastString + lines[0]);

			for(var i = 1; i < lines.length - 1; i++) {
				stream.in(lines[i]);
			}

			lastString = lines[lines.length - 1];
		} else {
			lastString += lines[lines.length - 1];
		}
	};

	this.onEnd = function() {
		if(lastString.length)
			stream.in(lastString);

		stream.end();
	};

	return stream;
};

TextStream.createFromStream = function(readableStream) {
	if(!(readableStream instanceof require('stream').Readable))
		throw new Error('Stream must be instance of stream.Readable');

	var ended = false;
	var stream = new TextStream();

	readableStream.on('readable', function() {
		var data = this.read();

		if(data)
			stream.in(data);
	});

	readableStream.on('end', function() {
		if(!ended)
			stream.end();

		ended = true;
	});

	return stream;
};

function AItemsStream() {
	throw new Error('abstract');
}

require('util').inherits(AItemsStream, AStream);

AItemsStream.prototype.filter = function(cb) {
	return this._chain(function(item, nextCb) {
		if(cb(item))
			nextCb(item);
	});
};

AItemsStream.prototype.map = function(cb) {
	return this._chain(function(item, nextCb) {
		nextCb(cb(item));
	});
};

AItemsStream.prototype.mapMulti = function(cb) {
	return this._chain(function(item, nextCb) {
		var list = cb(item);
		for(var i = 0; i < list.length; i++)
			nextCb(list[i]);
	})
};

// --------------

function LinesStream() {

};

function Sort(streams, options) {
	options = options || {};

	var key = options.key || {};
	var sortCmd = options.cmd || 'sort';

	var cmdLineOptions = {
		'-T': options.tmpDir,
		'-r': options.order === 'desc',
		'-f': !!options.ignoreCase,
		'-n': !!options.numeric,
		'-s': !!options.stable,
		'-S': options.bufferSize,
		'-u': !!options.unique,
		'-m': !!options.merge,

		'-t': key.separator,
		'-k': key.column
	};

	var ss = sortCmd.split(/\s+/g);
	sortCmd = ss.shift();

	var args = ss;
	for(var opt in cmdLineOptions) {
		var val = cmdLineOptions[opt];

		if(val === null || val === undefined || val === false)
			continue;

		if(val === true) {
			args.push(opt);
		} else {
			args.push(opt);
			args.push(val.toString());
		}
	}

	args.push('--');
	var stdio = [
		'ignore',
		'pipe',
		process.stderr
	];

	for(var i = 0; i < streams.length; i++) {
		args.push('/dev/fd/' + (3 + i));
		stdio.push('pipe');
	}

	var child = require('child_process').spawn(
		sortCmd,
		args,
		{
			cwd: '/',
			stdio: stdio
		}
	);

	child.on('error', function(e) {
		console.log(e);
	});

	for(var i = 0; i < streams.length; i++) {
		var dst = child.stdio[3 + i];
		dst.on('error', function(e) {
			if(e.code === 'ENOTCONN') {
				// ignore node bug
			} else {
				throw e;
			}
		});

		streams[i].pipe(child.stdio[3 + i]);
	}

	return child.stdout;
};

LinesStream.prototype.sort = function(options) {

};

require('util').inherits(LinesStream, AItemsStream);

// --------------
function JsonQL() {

}

JsonQL.prototype.stream = function(stream) {
	return TextStream.createFromStream(stream);
};

JsonQL.prototype.spawn = function(cmd, args, options) {
	options = options || {};

	var p = require('child_process').spawn(
		cmd,
		args,
		{
			stdio: ['ignore', 'pipe', process.stderr]
		}
	);

	return this.stream(p.stdout);
};

JsonQL.prototype.system = function(cmd, options) {
	return this.spawn('/bin/sh', ['-c', cmd], options);
};

JsonQL.prototype.stdin = function() {
	return this.stream(process.stdin);
};

function FakeStream() {
	this.n = 100000;
	FakeStream.super_.call(this);
}

require('util').inherits(FakeStream, require('stream').Readable);

FakeStream.prototype._read = function() {
//	console.error(1);
	this.n--;
	if(this.n < 0) {
		this.push(null);
		return;
	}
	this.push('hello1\n');
};

var sort = new Sort(
	[
//		process.stdin,
		new FakeStream,
//		new FakeStream,
	],
	{
		cmd: 'pv -L 10',
//		merge: true,
//		unique: true,
//		tmpDir: '/tmp',
//		bufferSize: 1024*1024*128
	}
);
//sort.pipe(process.stdout)
