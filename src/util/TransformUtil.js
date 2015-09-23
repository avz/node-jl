function TransformUtil() {
	TransformUtil.super_.call(this, [
	], 'FUNC');
};

require('util').inherits(TransformUtil, require('../Util.js').Util);

TransformUtil.prototype.run = function() {
	var mapFunction = this.needArgumentFunction(0);
	this.shiftArguments();

	var inputStream = this.getConcatenatedInputObjectsStream();

	return inputStream.pipe(this.jp.map(function(item, env) {
		var modified = mapFunction(item, env);

		if(modified === undefined)
			return item;

		return modified;
	}));
};

exports.TransformUtil = TransformUtil;
