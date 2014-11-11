var JP = require('../JP.js').JP;
var ArgFunction = require('../shell/wrapper/ArgFunction.js').ArgFunction;

var jp = new JP;

if(!process.argv[2])
	process.exit(255);

var f = new ArgFunction(process.argv[2], ['r'], 'r');

process.stdin.pipe(jp.splitLines())
	.pipe(jp.filter(function(line) {
		var o = JSON.parse(' ' + line);
		return f(o);
	}))
	.pipe(jp.joinLines())
	.pipe(process.stdout)
;

