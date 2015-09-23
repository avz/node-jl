function FilterUtil() {
	FilterUtil.super_.call(this, [
		['v', 'invert-match', 'invert the sense of matching, to select non-matching lines']
	], 'FILTER');
};

require('util').inherits(FilterUtil, require('../Util.js').Util);

FilterUtil.prototype.run = function() {
	var invertMatch = this.getOption('invert-match');

	var filterFunction = this.needArgumentFunction(0);
	this.shiftArguments();

	var inputStream = this.getConcatenatedInputObjectsStream();

	return inputStream.pipe(this.jp.filter(function(item, env) {
		var matched = filterFunction(item, env);

		if(invertMatch)
			return !matched;

		return !!matched;
	}));
};

exports.FilterUtil = FilterUtil;
