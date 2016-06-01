var sqlParser = require('../sql/sql.js');
var sqlNodes = require('../sql/nodes.js');
var GeneratorJs = require('../sql/generator.js').GeneratorJs;

var HLL;
try {
	HLL = require('hll-native').HLL;
} catch(e) {
	HLL = null;
}

function SqlUtil() {
	SqlUtil.super_.call(this, [
		['T', 'tmp-dir=DIR', 'use DIR for temporary files'],
		['S', 'buffer-size=SIZE', 'use SIZE for sort memory buffer (bytes)'],
	], 'SQL');
};

require('util').inherits(SqlUtil, require('../Util.js').Util);

SqlUtil.prototype.run = function() {
	var jp = this.jp;
	jp.addEnv(this.aggregationFunctions);
	jp.addEnv(this.functions);

	var sqlString = this.needArgument(0);
	var ast = sqlParser.parse(sqlString);
	var generator = new GeneratorJs('r', 'env');
	this.generator = generator;
	var js = generator.fromAst(ast);

	var cmds = [];

	var stdin = this.stdin;

	if(ast.columns) {
		stdin = this.pickUsedColumnsNative(ast, stdin);
	}

	if(js.where)
		cmds = this.pipeFilterUtil(cmds, js.where);

	if(ast.columns)
		cmds = this.pipeReduceCmd(cmds, ast);

	if(js.orderBy) {
		if(ast.orders.length > 1)
			throw new Error('Exactly one column must be in ORDER BY');

		cmds = this.pipeSortUtil(cmds, js.orderBy, ast.orders[0].direction, ast.orders[0].collation);
	}

	cmds.shift(); // leading |

	if(cmds.length)
		return this.runAsSubpipe(stdin, this.stdout, cmds);
	else
		return stdin;
};

/**
 * Оставить в обектах только реально используемые поля. Помогает для сложных
 * запросов с сортировками за счёт того, что JSON.stringify() и JSON.parse()
 * выполняется для небольших объектов.
 * @param {type} ast
 * @param {type} stream
 * @returns {undefined}
 */
SqlUtil.prototype.pickUsedColumnsNative = function(selectAst, stream) {
	var pathes = {};

	this.walkAstNodes(selectAst, sqlNodes.ColumnIdent, function(ident) {
		var path = ident.fragments.map(function(f) {
			return f.replace(/([.\\])/g, "\\$1");
		}).join('.');
		pathes[path] = path;
	});

	var list = Object.keys(pathes);

	var cmd = __dirname + '/../../node_modules/jl-pick/native/bin/jl-pick';
	var args = [];

	if(list.length) {
		if(this.ignoreJsonParsingError)
			args.push('-I');

		args = args.concat(list);
	} else {
		// Ни одного идентификатора
		// Это такой кривой костыль, чтобы все строки заменить на пустые объекты
		cmd = 'awk';
		args.push('{print "{}"}');
	}

	var options = {};

	options.stdio = [
		'pipe',
		options.outputStream || 'pipe',
		process.stderr
	];

	var p = require('child_process').spawn(
		cmd,
		args,
		options
	);

	p.on('exit', function(err, signal) {
		if(err)
			process.exit(1);
	});

	stream.pipe(p.stdin);

	return p.stdout;
};

SqlUtil.prototype.pickUsedColumnsJs = function(selectAst, stream) {
	var self = this;
	var templateTree = {};

	this.walkAstNodes(selectAst, sqlNodes.ColumnIdent, function(ident) {
		var path = ident.fragments;

		var o = templateTree;

		for(var i = 0; i < path.length - 1; i++) {
			var s = path[i];
			if(o[s] === undefined)
				o[s] = {};

			o = o[s];
		}

		o[path[path.length - 1]] = self.generator.fromAst(ident);
	});

	var toCode = function(template) {
		var code = '{';

		for(var k in template) {
			var v = template[k];

			code += JSON.stringify(k) + ': ';

			if(typeof(v) === 'string') {
				code += v + ', ';
			} else {
				code += toCode(v) + ', ';
			}
		}

		code += '}';

		return code;
	};

	var code = toCode(templateTree);

	var f = new Function('r', 'return ' + code);

	var objects = this.getObjectsStream(stream);

	return objects.pipe(this.jp.map(f));
};

SqlUtil.prototype.pipeReduceCmd = function(cmds, ast) {
	var aggregation = {
		init: 'this.aggregations = [];\n',
		update: '',
		result: 'env._aggregations = this.aggregations;\nreturn {'
	};

	var valuesWithoutAggregationSource = 'return {';

	var hasRealAggregations = false;

	for(var i = 0; i < ast.columns.length; i++) {
		var c = ast.columns[i];

		var columnName = this.generator.getColumnName(c);
		if(columnName === null)
			columnName = 'col_' + i;

		var agg = this.extractAggregation(columnName, c.expression);

		if(agg) {
			hasRealAggregations = true;
		} else {
			valuesWithoutAggregationSource += JSON.stringify(columnName) + ': ' + this.generator.fromAst(c.expression) + ', '

			agg = this.extractAggregation(
				columnName,
				new sqlNodes.Call(
					new sqlNodes.FunctionIdent({fragments: ['LAST']}),
					[c.expression]
				)
			);
		}

		aggregation.init += agg.init + '\n';
		aggregation.update += agg.update + '\n';
		aggregation.result += JSON.stringify(columnName) + ': ' + agg.result + ', ';
	}

	aggregation.result += '};';
	valuesWithoutAggregationSource += '};';

	if(hasRealAggregations) {
		// юзаем jl-reduce
		var js = this.generator.fromAst(ast);
		var keyGenerator;

		if(js.groupByJson) {
			keyGenerator = js.groupByJson;
			cmds = this.pipeSortUtil(cmds, keyGenerator);
		} else {
			keyGenerator = function() {return 'TOTAL'};
		}

		return cmds.concat([
			'|', 'jl-reduce',
			'-k', '{' + this.functionGetSource(keyGenerator) + '}',
			'-i', '{' + aggregation.init + '}',
			'-u', '{' + aggregation.update + '}',
			'-r', '{' + aggregation.result + '}',
			'|', 'jl-transform',
			'{ return r.value }'
		]);

	} else {
		// юзаем обычный jl-transform
		return cmds.concat([
			'|', 'jl-transform',
			'{' + valuesWithoutAggregationSource + '}'
		]);
	}
};

SqlUtil.prototype.extractAggregation = function(ident, expression) {
	var identJson = JSON.stringify(ident);
	var self = this;
	var aggregationList = [];

	this.walkAstNodes(expression, sqlNodes.Call, function(expression) {
		var name = expression.function.fragments.join('.');
		var af = self.aggregationFunctions[name];

		if(af) {
			aggregationList.push({
				name: name,
				init: 'new (env.' + name + ')',
				args: expression.args
			});

			expression.function.fragments = ['_aggregations', ident, aggregationList.length - 1, 'result'];
			expression.args = [];
		}
	});

	if(!aggregationList.length)
		return null;

	var inits = [];
	var updates = [];

	for(var i = 0; i < aggregationList.length; i++) {
		var af = aggregationList[i];

		inits.push(af.init);

		updates.push(
			'this.aggregations[' + identJson + '][' + i + '].update('
			+ af.args.map(this.generator.fromAst.bind(this.generator)).join(', ')
			+ ')'
		);
	}

	return {
		init: 'this.aggregations[' + identJson + '] = [' + inits.join(', ') + '];',
		update: updates.join('\n'),
		result: this.generator.fromAst(expression)
	};
};

SqlUtil.prototype.pipeSortUtil = function(args, keyGenerator, direction, collation) {
	var options = ['|', 'jl-sort'];

	if(this.getOption('tmp-dir') !== undefined) {
		options.push('-T');
		options.push(this.getOption('tmp-dir'));
	}

	if(this.getOption('buffer-size') !== undefined) {
		options.push('-S');
		options.push(this.getOption('buffer-size'));
	}

	if(collation === 'NUMERIC')
		options.push('-n');

	if(direction === 'DESC')
		options.push('-r');

	options.push('{' + this.functionGetSource(keyGenerator) + '}');

	return args.concat(options);
};

SqlUtil.prototype.pipeFilterUtil = function(args, filter) {
	var options = ['|', 'jl-filter'];

	options.push('{' + this.functionGetSource(filter) + '}');

	return args.concat(options);
};

SqlUtil.prototype.aggregationFunctions = {
	SUM: function() {
		this.sum = 0;

		this.update = function(value) {
			var v = value - 0;
			if(v)
				this.sum += v;
		};

		this.result = function() {
			return this.sum;
		};
	},
	MIN: function() {
		this.min = Infinity;

		this.update = function(value) {
			if(value === undefined || value === null)
				return;

			var v = value - 0;
			if(isNaN(v))
				return;

			if(v < this.min)
				this.min = v;
		};

		this.result = function() {
			return this.min;
		};
	},
	MAX: function() {
		this.max = -Infinity;

		this.update = function(value) {
			if(value === undefined || value === null)
				return;

			var v = value - 0;
			if(isNaN(v))
				return;

			if(v > this.max)
				this.max = v;
		};

		this.result = function() {
			return this.max;
		};
	},
	COUNT: function() {
		this.count = 0;

		this.update = function(v) {
			if(arguments.length) { // COUNT(expression)
				if(v !== null && v !== undefined)
					this.count++;
			} else { // COUNT(*)
				this.count++;
			}
		};

		this.result = function() {
			return this.count;
		};
	},
	HLL_COUNT_DISTINCT: function() {
		if(!HLL) {
			throw new Error('NPM module hll-native is not installed.');
		}

		this.set = new HLL(20);

		this.update = function(arg/* args */) {
			var key;

			if(arguments.length === 1) {
				key = JSON.stringify(arg)
			} else {
				var args = [];
				for(var i = 0; i < arguments.length; i++) {
					var a = arguments[i];
					if(a === undefined)
						a = null;

					args.push(a);
				}

				key = JSON.stringify(args);
			}

			this.set.add(key);
		};

		this.result = function() {
			return this.set.count();
		};
	},
	LAST: function() {
		this.last = null;

		this.update = function(value) {
			this.last = value;
		};

		this.result = function() {
			return this.last;
		};
	}
};

SqlUtil.formatDate = function(date) {
	var s =
		date.getUTCFullYear()
		+ '-' + (date.getUTCMonth() + 1 + 100).toString().slice(1)
		+ '-' + (date.getUTCDate() + 100).toString().slice(1)
	;

	return s;
};

SqlUtil.formatTime = function(date) {
	var s =
		(date.getUTCHours() + 100).toString().slice(1)
		+ ':' + (date.getUTCMinutes() + 100).toString().slice(1)
		+ ':' + (date.getUTCSeconds() + 100).toString().slice(1)
	;

	return s;
};

SqlUtil.formatDateTime = function(date) {
	return this.formatDate(date) + ' ' + this.formatTime(date);
};

SqlUtil.getDate = function(dateOrTime) {
	var date;

	if(dateOrTime instanceof Date) {
		date = dateOrTime;
	} else {
		var str = '' + dateOrTime;

		if(/^[0-9.]+$/.test(str)) {
			date = new Date(str * 1000);
		} else {
			date = new Date(str);
		}
	}

	if(!date.getTime())
		return null;

	return date;
};

SqlUtil.unixTimestamp = function(dateOrTime) {
	var date = this.getDate(dateOrTime);

	return date;
};

SqlUtil.prototype.functions = {
	FROM_UNIXTIME: function(unixTimestamp) {
		var date;

		if(!arguments.length) {
			date = new Date;
		} else {
			date = new Date(unixTimestamp * 1000);
		}

		if(!date)
			return null;

		return SqlUtil.formatDateTime(date);
	},
	UNIX_TIMESTAMP: function(date) {
		var d;

		if(!arguments.length) {
			d = new Date;
		} else {
			d = SqlUtil.getDate(date);
		}

		if(!d)
			return null;

		return d.getTime() / 1000;
	},
	DATE: function(date) {
		var d;

		if(!arguments.length) {
			d = new Date;
		} else {
			d = SqlUtil.getDate(date);
		}

		return SqlUtil.formatDate(d);
	},
	DATETIME: function(date) {
		var d;

		if(!arguments.length) {
			d = new Date;
		} else {
			d = SqlUtil.getDate(date);
		}

		return SqlUtil.formatDateTime(d);
	}
};

SqlUtil.prototype.walkAstNodes = function(ast, nodeType, cb) {
	var deep = function(expression) {
		if(expression instanceof nodeType) {
			cb(expression);
		}

		if(expression && typeof expression === 'object') {
			for(var k in expression) {
				var v = expression[k];
				deep(v);
			}
		}
	};

	deep(ast);
}

SqlUtil.prototype.functionGetSource = function(fn) {
	return fn.toString().replace(/^\s*function[^(]*\([^(]*\)\s*\{\s*([\s\S]*?)\s*\}\s*$/, '$1');
};

exports.SqlUtil = SqlUtil;
