function ExtractUtil() {
	ExtractUtil.super_.call(this, [
	], 'KEYDEF');
};

require('util').inherits(ExtractUtil, require('../Util.js').Util);

ExtractUtil.prototype.run = function() {
	var mapFunction = this.needArgumentFunction(0);
	this.shiftArguments();

	var inputStream = this.getConcatenatedInputObjectsStream();

	return inputStream.pipe(this.jp.map(function(item) {
		var v = mapFunction(item);

		if(v === undefined)
			return '';

		return '' + v;
	}, {resultType: 'line'}));
};

exports.ExtractUtil = ExtractUtil;
