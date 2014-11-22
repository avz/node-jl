function TransformUtil() {
	TransformUtil.super_.call(this, [
	]);
};

require('util').inherits(TransformUtil, require('../Util.js').Util);

TransformUtil.prototype.run = function() {
	var mapFunction = this.needArgumentFunction(0);
	this.shiftArguments();

	var inputStream = this.getConcatenatedInputObjectsStream();

	return inputStream.pipe(this.jp.map(function(item) {
		var modified = mapFunction(item);

		if(modified === undefined)
			return item;

		return modified;
	}));
};

exports.TransformUtil = TransformUtil;
