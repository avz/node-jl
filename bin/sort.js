var JP = require('../JP.js').JP;
var ShellSort = require('../shell/Sort.js').Sort;

var jp = new JP;

var sort = function(keyCb) {
	var options = {};

	var separator = '\t';

	var s = process.stdin
		.pipe(jp.splitLines())
		.pipe(jp.map(function(line) {
			var key = keyCb(JSON.parse(' ' + line));

			return JSON.stringify(key) + separator + line;
		}))
		.pipe(jp.joinLines())
	;

	options.separator = separator;
	options.key = '1,1';
	options.tmpDir = '/mnt/hd/tmp';
	options.compress = 'lzop';
	options.bufferSize = 1024*1024*128;
	options.outputStream = process.stdout;

	options.path = __dirname + '/helpers/sort.sh';

	var sort = new ShellSort([s], options);

	return sort;
};

if(!process.argv[2])
	process.exit(255);

var f = new Function('item', process.argv[2]);

sort(f);
