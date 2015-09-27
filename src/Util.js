var ArgFunction = require('./ArgFunction.js').ArgFunction;
var JP = require('./JP.js').JP;
var Router = require('./Router.js').Router;

function Util(args, argString) {
	args.push(['h', 'help', 'show this help']);
	args.push(['I', '', 'ignore JSON parsing errors']);
	args.push(['', 'include=ARG+', 'include this JS-file at startup']);
	args.push(['', 'env=ARG', 'set environment (node.js module)']);

	this.getopt = require('node-getopt').create(args);
	var title = require('path').basename(process.argv[1]);

	this.getopt.setHelp(
		"Usage: " + title + " [OPTIONS]" + (argString ? ' ' + argString : '') + " [FILE...]\n"
		+ "[[OPTIONS]]"
		+ "\nSee also: https://github.com/avz/node-jl/"
	);

	this.getopt.bindHelp();

	this.options = {};
	this.arguments = [];

	this.optionsOverride = {};

	this.stdin = null;
	this.stdout = null;

	this.jp = new JP;

	var self = this;

	this.jsonParsingErrorHandler = function(line, e) {
		self.jsonParsingErrorHandlerFatal(line, e);
	};
};

Util.error = {};

Util.error.NeedArgument = function(opt) {
	this.message = 'need argument: -' + opt;
};

Util.error.NotEnoughArguments = function(num) {
	this.message = 'not enough arguments: ' + (num + 1);
};

Util.prototype.jsonParsingErrorHandlerFatal = function(line, e) {
	this.jsonParsingErrorHandlerIgnore(line, e);
	process.exit(1);
};

Util.prototype.jsonParsingErrorHandlerIgnore = function(line, e) {
	process.stderr.write('ERROR: JSON parsing error (' + e.message + ') in: ' + line.replace(/^\s*|\s*$/g, '') + '\n');
};

Util.prototype.runFromShell = function(argv) {
	var args = argv.slice(2);

	process.stdout.on('error', function(e) {
		if(e.errno === 'EPIPE')
			process.exit();

		throw e;
	});

	this.runAsPipe(process.stdin, process.stdout, args);
};

Util.prototype.runAsSubpipe = function(stdin, stdout, args) {
	args = args.slice();

	var childCmd = args.shift();
	var child = Router.needUtil(childCmd);

	return child.runAsPipe(stdin, stdout, args, true);
};

Util.prototype.runAsPipe = function(stdin, stdout, args, isSubpipe) {
	var self = this;
	try {
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

		if(this.options.I) {
			this.jsonParsingErrorHandler = function(line, e) {
				self.jsonParsingErrorHandlerIgnore(line, e);
			};
		}

		if(this.options.include) {
			for(var i = 0; i < this.options.include.length; i++)
				require(this.options.include[i]);
		}

		if(this.options.env) {
			this.jp.addEnv(require(this.options.env));
		}

		var output;
		this.stdin = stdin;

		if(nextCmdArgs.length) { // запустили с внутренним пайпом
			var childCmd = nextCmdArgs.shift();
			var child = Router.needUtil(childCmd);

			output = child.runAsPipe(this.run(), stdout, nextCmdArgs);
		} else { // либо запустили только одну команду, либо это последняя
			this.stdout = stdout;

			output = this.run();

			if(!isSubpipe)
				this._outputToStdout(output);
		}
	} catch(e) {
		if(e instanceof Util.error.NeedArgument || e instanceof Util.error.NotEnoughArguments) {
			console.error(e.message);
			this.getopt.showHelp();
			process.exit(255);
		}

		throw e;
	}

	return output;
};

Util.prototype.runAsInline = function(stdin, stdout, options, args) {
	this.options = options;
	this.arguments = args;

	this.stdin = stdin;
	this.stdout = stdout;

	var output = this.run();

	this._outputToStdout(output);

	return output;
};

Util.prototype.overrideOption = function(option, value) {
	this.optionsOverride[option] = value;
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

	this.getRawStream(output).pipe(this.stdout);
};

Util.prototype.getOption = function(opt) {
	if(this.optionsOverride[opt] !== undefined)
		return this.optionsOverride[opt];

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
	var f = this.getOptionFunction(opt, args, defaultVariableName, options);

	if(!f)
		throw new (Util.error.NeedArgument)(opt);

	return f;
};

Util.prototype.getOptionFunction = function(opt, args, defaultVariableName, options) {
	if(!args)
		args = ['r', 'env'];

	if(!defaultVariableName)
		defaultVariableName = 'r';

	var v = this.getOption(opt);

	if(v) {
		/* специальный кейс когда агрументы задаются из скрипта */
		if(v instanceof Function)
			return v;
		return new ArgFunction(v, args, defaultVariableName, options);
	}

	return null;
};

Util.prototype.needArgumentFunction = function(argumentOffset, args, defaultVariableName, options) {
	if(!args)
		args = ['r', 'env'];

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

Util.prototype.getConcatenatedInputRawStream = function() {
	var self = this;
	var streams = this.getInputStreams();
	if(streams.length === 1) {
		return self.getRawStream(streams[0]);
	}

	var list = streams.slice(0);
	var pipe = new (require('stream').PassThrough);

	var pipeNext = function() {
		var s = list.shift();
		if(!s) {
			pipe.end();
			return;
		}

		s.on('end', pipeNext);
		self.getRawStream(s).pipe(pipe, {end: false});
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
			return stream.pipe(this.jp.jsonParse(this.jsonParsingErrorHandler));
		break;
		case 'object':
			return stream;
		break;
		default:
			return stream.pipe(this.jp.splitLines()).pipe(this.jp.jsonParse(this.jsonParsingErrorHandler));
	}
};

Util.prototype.getRawStream = function(stream) {
	switch(stream.elementsType) {
		case 'line':
			return stream.pipe(this.jp.joinLines());
		break;
		case 'object':
			return stream.pipe(this.jp.jsonStringify()).pipe(this.jp.joinLines());
		break;
		default:
			return stream
	}
};

Util.prototype.run = function() {
	throw new Error('Not implemented');
};

exports.Util = Util;
