var JP = require('../JP.js').JP;

var jp = new JP;

if(!process.argv[2])
	process.exit(255);

var f = new Function('item', process.argv[2]);

process.stdin.pipe(jp.splitLines())
	.pipe(jp.map(function(line) {
		var o = JSON.parse(' ' + line);
		o = f(o);
		return JSON.stringify(o);
	}))
	.pipe(jp.joinLines())
	.pipe(process.stdout)
;
