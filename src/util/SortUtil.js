function SortUtil() {
	SortUtil.super_.call(this, [
		['n', 'numeric', 'numeric sort'],
		['r', 'reverse', 'reverse (descending order)'],
		['m', 'merge', 'merge already sorted files'],
		['s', 'stable', 'stable sort'],
		['u', 'unique', 'unique'],
		['T', 'tmp-dir=DIR', 'use DIR for temporaries'],
		['S', 'buffer-size=SIZE', 'use SIZE for main memory buffer (bytes)'],
		['k', 'key=KEYDEF', 'sort key definition']
	], '-k KEYDEF');
};

require('util').inherits(SortUtil, require('../Util.js').Util);

SortUtil.prototype.run = function() {
	var jp = this.jp;
	var separator = '\t';

	var sortOptions = {
		numeric: this.getOption('numeric'),
		reverse: this.getOption('reverse'),
		merge: this.getOption('merge'),
		stable: this.getOption('stable'),
		unique: this.getOption('unique'),
		tmpDir: this.getOption('tmp-dir'),
		bufferSize: this.getOption('buffer-size')
	};

	var keyGenerator = this.needOptionFunction('key');
	var keyStringGenerator;

	if(sortOptions.numeric) {
		keyStringGenerator = function(obj) {
			var key = keyGenerator(obj);

			return ('' + key).match(/^[0-9]*/)[0];
		};
	} else {
		keyStringGenerator = function(obj) {
			var key = keyGenerator(obj);

			return JSON.stringify(key);
		};
	}

	/**
	 * Входной поток - сырые данные
	 * @param {type} stream
	 * @returns {unresolved}
	 */
	var convertFromRaw = function(stream) {
		return convertFromLines(stream.pipe(jp.splitLines()));
	};

	/**
	 * Если входной поток уже поделен на строки
	 * @param {type} stream
	 * @returns {unresolved}
	 */
	var convertFromLines = function(stream) {
		var exportKey = function(line) {
			var obj = JSON.parse(' ' + line);

			var keyString = keyStringGenerator(obj);

			return keyString + separator + line;
		};

		return stream.pipe(jp.map(exportKey));
	};

	/**
	 * Если входной поток поделен на объекты
	 * @param {type} stream
	 * @returns {unresolved}
	 */
	var convertFromObjects = function(stream) {
		var exportKey = function(obj) {
			var keyString = keyStringGenerator(obj);

			if(stream.constElements) {
				if(obj.___jp_originalJsonLine)
					return keyString + separator + obj.___jp_originalJsonLine;
			} else {
				if(obj.___jp_originalJsonLine)
					delete obj.___jp_originalJsonLine;
			}

			return keyString + separator + JSON.stringify(obj);
		};

		return stream.pipe(jp.map(exportKey));
	};

	var streams = this.getInputStreams();

	for(var i = 0; i < streams.length; i++) {
		var stream = streams[i];

		if(stream.elementsType === 'line')
			stream = convertFromLines(stream);
		else if(stream.elementsType === 'object')
			stream = convertFromObjects(stream);
		else
			stream = convertFromRaw(stream);

		stream = stream.pipe(jp.joinLines());

		streams[i] = stream;
	}

	sortOptions.separator = separator;
	sortOptions.key = '1,1';
	sortOptions.path = __dirname + '/../wrapper/helpers/sort.sh';

	if(this.output === process.stdout) {
		sortOptions.outputStream = process.stdout;
		new (require('../wrapper/Sort.js').Sort)(streams, sortOptions);
	} else {
		return new (require('../wrapper/Sort.js').Sort)(streams, sortOptions);
	}
};

exports.SortUtil = SortUtil;
