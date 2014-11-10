var JP = require('../JP.js').JP;
var ShellSort = require('../shell/Sort.js').Sort;
var ArgFunction = require('../shell/ArgFunction.js').ArgFunction;

var getopt = require('node-getopt').create([
	['n', '', 'numeric sort'],
	['r', '', 'reverse (descending order)'],
	['m', '', 'merge already sorted files'],
	['s', '', 'stable sort'],
	['u', '', 'unique'],
	['T', '=DIR', 'use DIR for temporaries'],
	['S', '=SIZE', 'use SIZE for main memory buffer (bytes)'],
	['k', '=KEYDEF', 'sort key definition'],
	['h', 'help', 'display this help']
]);

var opts = getopt.bindHelp().parseSystem().options;

if(!opts.k) {
	getopt.showHelp();
	process.exit(255);
}

var sortOptions = {
	numeric: opts.n,
	reverse: opts.r,
	stable: opts.s,
	unique: opts.u,
	tmpDir: opts.T,
	bufferSize: opts.S
};

var keyGenerator = new ArgFunction(opts.k, ['r'], 'r');

var jp = new JP;

var sort = function(keyCb) {
	var options = sortOptions;

	var separator = '\t';

	var s = process.stdin
		.pipe(jp.splitLines())
		.pipe(jp.map(function(line) {
			var key;

			try {
				var obj = JSON.parse(' ' + line);
				key = keyCb(obj);
			} catch(e) {
				console.error(e);
				key = null;
			}

			return JSON.stringify(key) + separator + line;
		}))
		.pipe(jp.joinLines())
	;

	options.separator = separator;
	options.key = '1,1';
	options.outputStream = process.stdout;

	options.path = __dirname + '/helpers/sort.sh';

	var sort = new ShellSort([s], options);

	return sort;
};

if(!process.argv[2])
	process.exit(255);

sort(keyGenerator);
