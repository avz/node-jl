var inherits = require('util').inherits;
var Transform = require('stream').Transform;
var Readable = require('stream').Readable;

function JP() {
	this.objectStreamHightWarerMark = 1;
};

JP.prototype._createObjectsTransform = function(type, constElements, options) {
	var self = this;

	var to = {
		objectMode: true,
		highWaterMark: self.objectStreamHightWarerMark
	};

	if(options) {
		for(var k in options)
			to[k] = options[k];
	}

	var t = new (require('stream').Transform)(to);

	t.elementsType = type;
	t.constElements = constElements;

	t.on('pipe', function(src) {
		if(!this.elementsType)
			this.elementsType = src.elementsType;

		if(this.constElements && src.constElements === false)
			this.constElements = src.constElements;
	});

	return t;
}

JP.prototype._wrapStream = function(stream) {
	return stream;
};

JP.prototype.map = function(cb, options) {
	options = options || {};
	if(options.constElements === undefined)
		options.constElements = false;

	var transform = this._createObjectsTransform(options.resultType, options.constElements);

	transform._transform = function(items, encoding, callback) {
		var out = [];

		for(var i = 0; i < items.length; i++)
			out.push(cb.call(this, items[i]));

		if(items.length)
			this.push(out);

		callback();
	};

	return this._wrapStream(transform);
};

JP.prototype.filter = function(cb) {
	var transform = this._createObjectsTransform(undefined, true);

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

	var transform = this._createObjectsTransform('line', true);

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

	var transform = this._createObjectsTransform('raw', true);

	transform._transform = function(lines, encoding, callback) {
		if(lines.length)
			this.push(lines.join('\n') + '\n');

		callback();
	};

	return this._wrapStream(transform);
};

JP.prototype.transformRawToObject = function(onData, onEnd, options) {
	var transform = this._createObjectsTransform('object', true, options);

	transform._transform = onData;
	if(onEnd)
		transform._flush = onEnd;

	return transform;
};

JP.prototype.jsonStringify = function() {
	return this.map(
		function(item) {
			if(this.constElements) {
				if(item && item.___jp_originalJsonLine !== undefined)
					return item.___jp_originalJsonLine;
			} else {
				if(item && item.___jp_originalJsonLine !== undefined)
					delete item.___jp_originalJsonLine;
			}

			return JSON.stringify(item);
		},
		{
			resultType: 'line',
			constElements: true
		}
	);
};

/**
 * На входе поток айтемов, на выходе поток массивов айтемов до n элементов
 * @param {number} chunkSize максимальный размер чанка
 * @returns {undefined}
 */
JP.prototype.toChunks = function(chunkSize) {
	var transform = this._createObjectsTransform('object', true);

	var chunk = [];

	var flusher = null;

	var flush = function() {
		if(flusher)
			clearImmediate(flusher);

		if(!chunk.length)
			return;

		transform.push(chunk);
		chunk = [];
	};

	var touchScheduler = function() {
		if(!flusher)
			flusher = setImmediate(flush);
	};

	transform._transform = function(item, encoding, callback) {
		chunk.push(item);

		if(chunk.length > chunkSize) {
			flush();
			setImmediate(callback);
		} else {
			touchScheduler();
			callback();
		}
	};

	transform._flush = flush;

	return transform;
};

JP.prototype.jsonParse = function() {
	return this.map(function(line) {
		/* Пробел - хак для ускорения парсинга жсона */
		var l = ' ' + line;
		var o = JSON.parse(l);

		o.___jp_originalJsonLine = line;

		return o;
	}, {resultType: 'object', constElements: true});
};

exports.JP = JP;
