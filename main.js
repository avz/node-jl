process.on('SIGPIPE', function() {
	process.exit(1);
});

function JsonQL() {

};

JsonQL.prototype.file = function(path) {
	return this.stream(
		require('fs').createReadStream(path)
	);
};

JsonQL.prototype.stream = function(stream) {
	return new JsonQL.ReadableStreamWrapper(
		stream
	);
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

JsonQL.AItemsStream = function() {
	this._onItemIsSet = false;
	this._onEndIsSet = false;

	throw new Error('Abstract');
};

JsonQL.AItemsStream.prototype._item = function(item) {
	// ignore
};

JsonQL.AItemsStream.prototype._end = function() {
	// ignore
};

JsonQL.AItemsStream.prototype.onItem = function(cb) {
	if(this._onItemIsSet)
		throw new Error('Already');

	this._onItemIsSet = true;

	this._item = cb;
};

JsonQL.AItemsStream.prototype.onEnd = function(cb) {
	if(this._onEndIsSet)
		throw new Error('Already');

	this._onEndIsSet = true;

	this._end = cb;
};

JsonQL.AItemsStream.prototype.each = function(cb) {
	this.onItem(cb);
};

JsonQL.AItemsStream.prototype.map = function(cb) {
	return new JsonQL.ItemsStreamTransform(this, cb);
};

JsonQL.AItemsStream.prototype.filter = function(cb) {
	return new JsonQL.ItemsStreamFilter(this, cb);
};

JsonQL.AItemsStream.prototype.head = function(number) {
	return new JsonQL.ItemsStreamHead(this, number);
};

JsonQL.AItemsStream.prototype.combine = function(itemsStream, options) {
	return new JsonQL.ItemsStreamCombine([this, itemsStream], options);
};

JsonQL.AItemsStream.prototype.mix = function(itemsStream) {
	return new JsonQL.ItemsStreamCombine([this, itemsStream], {parallel: true});
};

JsonQL.AItemsStream.prototype.join = function() {
	return new JsonQL.JoinStreamWrapper(this);
};

JsonQL.AItemsStream.prototype.joinLines = function(delimiter) {
	if(!delimiter)
		delimiter = '\n';

	return new JsonQL.JoinStreamWrapper(
		this.map(function(item) {
			return item + delimiter;
		})
	);
};

JsonQL.AItemsStream.prototype.push = function(item) {
	return new JsonQL.ItemsStreamAppend(this, [item]);
};

JsonQL.AItemsStream.prototype.count = function(cb) {
	var count = 0;

	this.onItem(function() {
		count++;
	});

	this.onEnd(function() {
		cb(count);
	});
};


JsonQL.LinesStream = function(inputLinesStream) {

};

require('util').inherits(JsonQL.LinesStream, JsonQL.AItemsStream);

JsonQL.LinesStream.prototype.cut = function(inputDelimiter, fields, outputDelimiter) {

};


JsonQL.ARawStream = function() {
	this._onDataIsSet = false;
	this._onEndIsSet = false;

	throw new Error('Abstract');
};


JsonQL.ARawStream.prototype._data = function(data) {
	// ignore
};

JsonQL.ARawStream.prototype._end = function() {
	// ignore
};

JsonQL.ARawStream.prototype.onData = function(cb) {
	if(this._onDataIsSet)
		throw new Error('Already');

	this._onDataIsSet = true;

	this._data = cb;
};

JsonQL.ARawStream.prototype.onEnd = function(cb) {
	if(this._onEndIsSet)
		throw new Error('Already');

	this._onEndIsSet = true;

	this._end = cb;
};

JsonQL.ARawStream.prototype.splitLines = function(delimiter) {
	if(!delimiter)
		delimiter = '\n';

	return new JsonQL.LinesStreamWrapper(this, delimiter);
};


JsonQL.ItemsStreamTransform = function(itemsStream, cb) {
	var self = this;

	itemsStream.onItem(function(item) {
		self._item(cb(item));
	});

	itemsStream.onEnd(function() {
		self._end();
	});
};

require('util').inherits(JsonQL.ItemsStreamTransform, JsonQL.AItemsStream);

JsonQL.ItemsStreamAppend = function(itemsStream, items) {
	var self = this;

	itemsStream.onItem(function(item) {
		self._item(item);
	});

	itemsStream.onEnd(function() {
		for(var i = 0; i < items.length; i++)
			self._item(items[i]);

		self._end();
	});
};

require('util').inherits(JsonQL.ItemsStreamAppend, JsonQL.AItemsStream);

JsonQL.ItemsStreamFilter = function(itemsStream, cb) {
	var self = this;

	itemsStream.onItem(function(item) {
		if(cb(item))
			self._item(item);
	});

	itemsStream.onEnd(function() {
		self._end();
	});
};

require('util').inherits(JsonQL.ItemsStreamFilter, JsonQL.AItemsStream);

JsonQL.ItemsStreamCombine = function(itemsStreams, options) {
	var self = this;

	var ended = 0;

	if(options.parallel) {
		for(var i = 0; i < itemsStreams.length; i++) {
			itemsStreams[i].onItem(function(item) {
				self._item(item);
			});

			itemsStreams[i].onEnd(function() {
				ended++;

				if(ended >= itemsStreams.length)
					self._end();
			});
		}
	} else {
		throw new Error('Not Implemented');
	}
};

require('util').inherits(JsonQL.ItemsStreamCombine, JsonQL.AItemsStream);

JsonQL.ItemsStreamHead = function(itemsStream, number) {
	var self = this;

	var n = 0;

	itemsStream.onItem(function(item) {
		if(n >= number)
			return;

		n++;

		self._item(item);
	});

	itemsStream.onEnd(function() {
		self._end();
	});
};

require('util').inherits(JsonQL.ItemsStreamHead, JsonQL.AItemsStream);

JsonQL.LinesStreamWrapper = function(readableStreamWrapper, delimiter) {
	this.readableStreamWrapper = readableStreamWrapper;

	var self = this;

	var lastString = '';

	this.readableStreamWrapper.onData(function(buf) {
		var lines = buf.toString().split(delimiter);

		if(lines.length > 1) {
			self._item(lastString + lines[0] + delimiter);

			for(var i = 1; i < lines.length - 1; i++) {
				self._item(lines[i] + delimiter);
			}

			lastString = lines[lines.length - 1];
		} else {
			lastString += lines[lines.length - 1];
		}
	});

	this.readableStreamWrapper.onEnd(function() {
		if(lastString.length)
			self._item(lastString + delimiter);

		self._end();
	});
};

require('util').inherits(JsonQL.LinesStreamWrapper, JsonQL.AItemsStream);

JsonQL.JoinStreamWrapper = function(itemsStream) {
	var self = this;

	itemsStream.onItem(function(item) {
		self._data(item);
	});

	itemsStream.onEnd(function() {
		self._end();
	});
};

require('util').inherits(JsonQL.JoinStreamWrapper, JsonQL.ARawStream);

JsonQL.JoinStreamWrapper.prototype.stdout = function() {
	this.onData(function(data) {
		process.stdout.write(data);
	})
};


JsonQL.ReadableStreamWrapper = function(readableStream) {
	if(!(readableStream instanceof require('stream').Readable))
		throw new Error('Stream must be instance of stream.Readable');

	this.stream = readableStream;

	var self = this;
	var ended = false;

	this.stream.on('readable', function() {
		var data = this.read();

		if(data)
			self._data(data);
	});

	this.stream.on('end', function() {
		if(!ended)
			self._end();

		ended = true;
	});
};

require('util').inherits(JsonQL.ReadableStreamWrapper, JsonQL.ARawStream);

var stream = new JsonQL();

stream
	.stdin()
	.splitLines()
	.map(JSON.parse)
	.filter(function(item) {
		return item.ts > 1234567890;
	})
	.map(JSON.stringify)
	.joinLines()
	.stdout()
;
