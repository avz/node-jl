var JP = require('../JP.js').JP;
var ShellSort = require('../shell/wrapper/Sort.js').Sort;
var ArgFunction = require('../shell/wrapper/ArgFunction.js').ArgFunction;

var getopt = require('node-getopt').create([
	['n', 'numeric', 'numeric sort'],
	['r', 'reverse', 'reverse (descending order)'],
	['m', 'merge', 'merge already sorted files'],
	['s', 'stable', 'stable sort'],
	['u', 'unique', 'unique'],
	['T', 'tmp-dir=DIR', 'use DIR for temporaries'],
	['S', 'buffer-size=SIZE', 'use SIZE for main memory buffer (bytes)'],
	['k', 'key=KEYDEF', 'sort key definition'],
	['h', 'help', 'display this help']
]);

var o = getopt.bindHelp().parseSystem();
var argv = o.argv;
var opts = o.options;

if(!opts.k) {
	getopt.showHelp();
	process.exit(255);
}

var sortOptions = {
	numeric: opts.n,
	reverse: opts.r,
	merge: opts.m,
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
	var streams = [];

	for(var i = 0; i < argv.length; i++) {
		streams.push(require('fs').createReadStream(argv[i]));
	}

	if(!streams.length)
		streams.push(process.stdin);

	for(var i = 0; i < streams.length; i++) {
		streams[i] = streams[i]
			.pipe(jp.splitLines())
			.pipe(jp.map(function(line) {
				var key;

				try {
					var obj = JSON.parse(' ' + line);
					key = keyCb(obj);

					if(key === undefined)
						key = null;
				} catch(e) {
					console.error(e);
					key = null;
				}

				return JSON.stringify(key) + separator + line;
			}))
			.pipe(jp.joinLines())
		;
	}

	options.separator = separator;
	options.key = '1,1';
	options.outputStream = process.stdout;

	options.path = __dirname + '/helpers/sort.sh';

	var sort = new ShellSort(streams, options);

	return sort;
};

if(!process.argv[2])
	process.exit(255);

sort(keyGenerator);
