function FromCsvUtil() {
	FromCsvUtil.super_.call(this, [
		['a', 'auto-types', 'if enabled, the parser will attempt to convert read data types to native types'],
		['f', 'fields=', 'manually specify list of column names (comma-separated)'],
		['d', 'delimiter=', 'field delimiter [,]'],
		['q', 'quote', 'quote character ["]'],
		['s', 'skip-empty-lines', 'skip-empty-lines [disabled]'],
		['t', 'trim', ' ignore whitespace immediately around the delimiter [disabled]']
	]);
};

require('util').inherits(FromCsvUtil, require('../Util.js').Util);

FromCsvUtil.prototype.run = function() {
	var parse = require('csv-parse');
	var fieldsString = this.getOption('fields');
	var fields = true;

	if(fieldsString)
		fields = fieldsString.split(',');

	var parseOptions = {
		delimiter: this.getOption('delimiter') || ',',
		quote: this.getOption('quote') || '"',
		skip_empty_lines: !!this.getOption('skip-empty-lines'),
		trim: !!this.getOption('trim'),
		auto_parse: !!this.getOption('auto-types'),
		columns: fields === true ? true : null,
		highWaterMark: 1,
		objectMode: true
	};

	var parser = parse(parseOptions);
	var chunker = this.jp.toChunks(512);
	var inputStream = this.getConcatenatedInputRawStream();

	var pipe = inputStream.pipe(parser).pipe(chunker);

	if(fields instanceof Array) {
		var arrayToObject = this._generateFieldExportedFunction(fields);
		return pipe.pipe(this.jp.map(arrayToObject));
	} else {
		return pipe;
	}
};

FromCsvUtil.prototype._generateFieldExportedFunction = function(fields) {
	var lines = [];

	for(var i = 0; i < fields.length; i++) {
		if(fields[i].length)
			lines.push('"' + fields[i] + '": row[' + i + ']');
	}

	var src = 'return {\n\t' + lines.join(',\n\t') + '\n};';

	return new Function('row',  src);
};

exports.FromCsvUtil = FromCsvUtil;
