var os = require('os');
var fs = require('fs');
var crypto = require('crypto');

function ChildProcessFifos(streams, command, args, options) {
	this.tmpDir = options.tmpDir || os.tmpdir();

	return this._runFifos(streams, command, args, options);
};

ChildProcessFifos.sequenceNumber = 0;

ChildProcessFifos.prototype._runFifos = function(streams, cmd, args, options) {
	var mkfifoSync = require('mkfifo').mkfifoSync;

	options.stdio = [
		'ignore',
		options.outputStream || 'pipe',
		process.stderr
	];

	var fifos = [];
	var proc;

	var clearFifos = function() {
		for(var i = 0; i < fifos.length; i++) {
			var fifo = fifos[i];

			fifo.stream.end();
			fs.unlinkSync(fifo.path);
		}

		fifos = [];

		if(proc)
			proc.kill()

		process.removeListener('exit', clearFifos);
	};

	process.once('exit', clearFifos);

	try {
		var fullArgs = args.slice(0);
		fullArgs.push('--');

		for(var i = 0; i < streams.length; i++) {
			ChildProcessFifos.sequenceNumber++;

			var p = this.tmpDir + '/process.' + process.pid + '.' + ChildProcessFifos.sequenceNumber + '.' + crypto.randomBytes(8).toString('hex') + '.fifo';

			mkfifoSync(p, 384); // 0600

			var ws = fs.createWriteStream(p);
			streams[i].pipe(ws);

			fifos.push({
				path: p,
				stream: ws
			});

			fullArgs.push(p);
		}

		console.error(cmd, fullArgs);

		proc = require('child_process').spawn(
			cmd,
			fullArgs,
			options
		);

		proc.on('exit', clearFifos);

		return proc;
	} catch(e) {
		clearFifos();
		throw e;
	}
};

exports.ChildProcessFifos = ChildProcessFifos;
