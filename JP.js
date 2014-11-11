var inherits = require('util').inherits;
var Transform = require('stream').Transform;
var Readable = require('stream').Readable;

function JP() {
	this.objectStreamHightWarerMark = 1;
};

JP.prototype._createObjectsTransform = function(type) {
	var self = this;

	var t = new (require('stream').Transform)({
		objectMode: true,
		highWaterMark: self.objectStreamHightWarerMark
	});

	t.elementsType = type;

	t.on('pipe', function(src) {
		if(!this.elementsType)
			this.elementsType = src.elementsType;
	});

	return t;
}

JP.prototype._wrapStream = function(stream) {
	return stream;
};

JP.prototype.map = function(cb, options) {
	options = options || {};

	var transform = this._createObjectsTransform(options.resultType);

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
	var transform = this._createObjectsTransform();

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

	var transform = this._createObjectsTransform('line');

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

	var transform = this._createObjectsTransform('raw');

	transform._transform = function(lines, encoding, callback) {
		if(lines.length)
			this.push(lines.join('\n') + '\n');

		callback();
	};

	return this._wrapStream(transform);
};

JP.prototype.jsonStringify = function() {
	return this.map(JSON.stringify, {resultType: 'line'});
};

JP.prototype.jsonParse = function() {
	return this.map(function(line) {
		/* Пробел - хак для ускорения парсинга жсона */
		return JSON.parse(' ' + line);
	}, {resultType: 'object'});
};

exports.JP = JP;
