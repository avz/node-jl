var ArgFunction = require('./ArgFunction.js').ArgFunction;
var JP = require('../JP.js').JP;

function Util(args) {
	args.push(['h', 'help', 'show this help']);

	this.getopt = require('node-getopt').create(args);

	this.getopt.bindHelp();

	this.options = {};
	this.arguments = [];
	this.outputStream = null;

	this.jp = new JP;
};

Util.error = {};

Util.error.NeedArgument = function(opt) {
	return Error('need argument: -' + opt);
};

Util.prototype.runFromShell = function() {
	var o = this.getopt.parseSystem();

	this.options = o.options;
	this.arguments = o.argv;
	this.outputStream = process.stdout;

	var output = this.run();

	if(this.outIsStdout())
		this._outputToStdout(output);
};

Util.prototype.fatalError = function(e) {
	console.error(e.toString());
	process.exit(e.errno % 255 || 1);

};

Util.prototype._outputToStdout = function(output) {
	if(!output) {
		/* говорит о том, что таск уже сделал всё что хотел */
		return;
	}

	switch(output.elementsType) {
		case 'object':
			output = output.pipe(this.jp.map(JSON.stringify, {resultType: 'line'}));
		case 'line':
			output = output.pipe(this.jp.joinLines())
		break;
	}

	output.pipe(this.outputStream);
};

Util.prototype.getOption = function(opt) {
	return this.options[opt];
};

Util.prototype.needOption = function(opt) {
	var v = this.getOption(opt);

	if(v === undefined || v === null)
		throw new (Util.error.NeedArgument)(opt);

	return v;
};

Util.prototype.needOptionFunction = function(opt, args, defaultVariableName, options) {
	if(!args)
		args = ['r'];

	if(!defaultVariableName)
		defaultVariableName = 'r';

	return new ArgFunction(this.needOption(opt), args, defaultVariableName, options);
};

Util.prototype.getArguments = function() {
	return this.arguments;
};

Util.prototype.getInputStreams = function() {
	var args = this.getArguments();

	try {
		var streams = [];

		for(var i = 0; i < args.length; i++) {
			var fd = require('fs').openSync(args[i], 'r');
			var stat = require('fs').fstatSync(fd);

			if(stat.isDirectory())
				throw new Error('EISDIR, is a directory \'' + args[i] + '\'');

			var stream = require('fs').createReadStream(
				args[i],
				{
					fd: fd
				}
			);

			streams.push(stream);
		}

		if(!streams.length)
			streams.push(process.stdin.pipe(this.jp.splitLines()));

		return streams;
	} catch(e) {
		this.fatalError(e);
	}
};

Util.prototype.outIsStdout = function() {
	return this.outputStream === process.stdout;
};

Util.prototype.run = function() {
	throw new Error('Not implemented');
};

exports.Util = Util;
