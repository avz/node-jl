var fs = require('fs');

var ChildProcessFifos = require('./ChildProcessFifos.js').ChildProcessFifos;

function Join(leftStream, rightStream, separator, leftColumn, rightColumn, options) {
	options = options || {};

	var cmd = options.path || 'join';

	var argsHash = {
		'-i': !!options.ignoreCase,
		'-1': leftColumn,
		'-2': rightColumn,
		'-t': separator
	}

	var args = [];

	for(var opt in argsHash) {
		var optval = argsHash[opt];

		if(optval === null || optval === undefined || optval === false)
			continue;

		if(optval === true) {
			args.push(opt);
		} else {
			args.push(opt);
			args.push(optval.toString());
		}
	}

	var p = this._runFifos(
		[leftStream, rightStream],
		cmd,
		args,
		{}
	);

	p.stdout.close = function() {
		p.clear();
	};

	return p.stdout;
};

Join.prototype._runFifos = function(streams, cmd, args, options) {
	return new ChildProcessFifos(streams, cmd, args, options);
};

exports.Join = Join;
