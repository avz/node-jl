var ArgFunction = require('./ArgFunction.js').ArgFunction;
var JP = require('../JP.js').JP;
var Router = require('./Router.js').Router;

function Util(args) {
	args.push(['h', 'help', 'show this help']);

	this.getopt = require('node-getopt').create(args);

	this.getopt.bindHelp();

	this.options = {};
	this.arguments = [];

	this.stdin = null;
	this.stdout = null;

	this.jp = new JP;
};

Util.error = {};

Util.error.NeedArgument = function(opt) {
	return Error('need argument: -' + opt);
};

Util.error.NotEnoughArguments = function(num) {
	return Error('not enough arguments: ' + (num + 1));
};

Util.prototype.runFromShell = function() {
	var args = process.argv.slice(2);

	this.runAsPipe(process.stdin, process.stdout, args);
};

Util.prototype.runAsPipe = function(stdin, stdout, args) {
	var cmdArgs = [];
	var nextCmdArgs = [];

	for(var i = 0; i < args.length; i++) {
		if(args[i] === '|') {
			nextCmdArgs = args.slice(i + 1);
			break;
		}

		cmdArgs.push(args[i]);
	}

	var o = this.getopt.parse(cmdArgs);

	this.options = o.options;
	this.arguments = o.argv;


	var output;
	this.stdin = stdin;

	if(nextCmdArgs.length) { // запустили с внутренним пайпом
		var childCmd = nextCmdArgs.shift();
		var child = Router.needUtil(childCmd);

		output = child.runAsPipe(this.run(), stdout, nextCmdArgs);
	} else { // либо запустили только одну команду, либо это последняя
		this.stdout = stdout;

		output = this.run();

		this._outputToStdout(output);
	}

	return output;
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
			output = output.pipe(this.jp.jsonStringify());
		case 'line':
			output = output.pipe(this.jp.joinLines())
		break;
	}

	output.pipe(this.stdout);
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

Util.prototype.needArgument = function(offset) {
	if(this.arguments.length <= offset)
		throw new (Util.error.NotEnoughArguments)(offset);

	return this.arguments[offset];
};

Util.prototype.needOptionFunction = function(opt, args, defaultVariableName, options) {
	if(!args)
		args = ['r'];

	if(!defaultVariableName)
		defaultVariableName = 'r';

	return new ArgFunction(this.needOption(opt), args, defaultVariableName, options);
};

Util.prototype.needArgumentFunction = function(argumentOffset, args, defaultVariableName, options) {
	if(!args)
		args = ['r'];

	if(!defaultVariableName)
		defaultVariableName = 'r';

	return new ArgFunction(this.needArgument(argumentOffset), args, defaultVariableName, options);
};

Util.prototype.shiftArguments = function() {
	return this.arguments.shift();
};


Util.prototype.getArguments = function() {
	return this.arguments;
};

Util.prototype.getInputStreams = function() {
	var args = this.getArguments();

	try {
		var streams = [];

		for(var i = 0; i < args.length; i++) {
			var stream;

			if(args[i] === '-') {
				stream = this.stdin;
			} else {
				var fd = require('fs').openSync(args[i], 'r');
				var stat = require('fs').fstatSync(fd);

				if(stat.isDirectory())
					throw new Error('EISDIR, is a directory \'' + args[i] + '\'');

				stream = require('fs').createReadStream(
					args[i],
					{
						fd: fd
					}
				);
			}

			streams.push(stream);
		}

		if(!streams.length)
			streams.push(this.stdin);

		return streams;
	} catch(e) {
		this.fatalError(e);
	}
};

Util.prototype.getConcatenatedInputObjectsStream = function() {
	var self = this;
	var streams = this.getInputStreams();
	if(streams.length === 1) {
		return self.getObjectsStream(streams[0]);
	}

	var list = streams.slice(0);
	var pipe = new (require('stream').PassThrough);
	pipe.elementsType = 'object';

	var pipeNext = function() {
		var s = list.shift();
		if(!s) {
			pipe.end();
			return;
		}

		s.on('end', pipeNext);
		self.getObjectsStream(s).pipe(pipe, {end: false});
	}

	pipeNext();

	return pipe;
};

Util.prototype.getLinesStream = function(stream) {
	switch(stream.elementsType) {
		case 'line':
			return stream;
		break;
		case 'object':
			return stream.pipe(this.jp.jsonStringify());
		break;
		default:
			stream.pipe(this.jp.splitLines());
	}
};

Util.prototype.getObjectsStream = function(stream) {
	switch(stream.elementsType) {
		case 'line':
			return stream.pipe(this.jp.jsonParse());
		break;
		case 'object':
			return stream;
		break;
		default:
			return stream.pipe(this.jp.splitLines()).pipe(this.jp.jsonParse());
	}
};

Util.prototype.run = function() {
	throw new Error('Not implemented');
};

exports.Util = Util;
