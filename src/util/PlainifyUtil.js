function PlainifyUtil() {
	PlainifyUtil.super_.call(this, [
	]);
};

require('util').inherits(PlainifyUtil, require('../Util.js').Util);

PlainifyUtil.prototype.run = function() {
	var inputStream = this.getConcatenatedInputObjectsStream();

	var plainify = function(src, dst, prefix) {
		for(var k in src) {
			var v = src[k];

			if(typeof(v) === 'object') {
				plainify(v, dst, prefix + k + '.');
			} else {
				dst[prefix + k] = v;
			}
		}
	};

	return inputStream.pipe(this.jp.map(function(item) {
		var newItem;

		if(typeof(item) === 'object') {
			newItem = {};
		} else {
			return item;
		}

		plainify(item, newItem, '');

		return newItem;
	}));
};

exports.PlainifyUtil = PlainifyUtil;
