var fs = require('fs');

var ChildProcessFifos = require('./ChildProcessFifos.js').ChildProcessFifos;

function Sort(streams, options) {
	options = options || {};

	var sortCmd = options.path || 'sort';

	var argsHash = {
		'-u': !!options.unique,
		'-n': !!options.numeric,
		'-r': !!options.reverse,
		'-s': !!options.stable,
		'-m': !!options.merge,
		'-i': !!options.ignoreCase,
		'-R': !!options.sortByHash,
		'-T': options.tmpDir,
		'-S': options.bufferSize ? options.bufferSize + 'b' : null,
		'-t': options.separator,
		'-k': options.key,
		'--parallel': options.threads,
//		'--compress-program': options.compress
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

	var p;

	if(!options.merge || streams.length === 1) {
		// упрощённый варинт, работающий через STDOUT
		var stream;
		if(streams.length === 1) {
			stream = streams[0];
		} else {
			// мерджим все стримы в один поток
			stream = this._streamsConcat(streams);
		}

		p = this._runSimple(
			stream,
			sortCmd,
			args,
			options
		);
	} else {
		// вариант, работающий через пачку FIFO
		p = this._runFifos(
			streams,
			sortCmd,
			args,
			options
		);
	}

	return p.stdout;
};

Sort.prototype._streamsConcat = function(streams) {
	var list = streams.slice(0);
	var pipe = new (require('stream').PassThrough);

	var pipeNext = function() {
		var s = list.shift();
		if(!s) {
			pipe.end();
			return;
		}

		s.on('end', pipeNext);
		s.pipe(pipe, {end: false});
	}

	pipeNext();

	return pipe;
};

Sort.prototype._runFifos = function(streams, cmd, args, options) {
	return new ChildProcessFifos(streams, cmd, args, options);
};

Sort.prototype._runSimple = function(stream, cmd, args, options) {
	options.stdio = [
		'pipe',
		options.outputStream || 'pipe',
		process.stderr
	];

//	console.error('simple', cmd, args);
	var p = require('child_process').spawn(
		cmd,
		args,
		options
	);

	stream.pipe(p.stdin);

	return p;
};

exports.Sort = Sort;
