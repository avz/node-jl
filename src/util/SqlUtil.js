var sqlParser = require('../sql/sql.js');
var sqlNodes = require('../sql/nodes.js');
var GeneratorJs = require('../sql/generator.js').GeneratorJs;

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

	var sqlString = this.needArgument(0);
	var ast = sqlParser.parse(sqlString);
	var generator = new GeneratorJs('r', 'env');
	this.generator = generator;
	var js = generator.fromAst(ast);

	var cmds = [];

	if(js.where)
		cmds = this.pipeFilterUtil(cmds, js.where);

	cmds = this.pipeReduceCmd(cmds, ast);

	if(js.orderBy) {
		if(ast.orders.length > 1)
			throw new Error('Exactly one column must be in ORDER BY');

		cmds = this.pipeSortUtil(cmds, js.orderBy, ast.orders[0].direction, ast.orders[0].collation);
	}

	cmds.shift(); // leading |
//console.error(cmds);
	var output = this.runAsSubpipe(this.stdin, this.stdout, cmds);

	return output;
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

	if(ast.groups.length && !hasRealAggregations)
		throw new Error('GROUP BY without aggregation functions');

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

	var deep = function(expression) {
		if(expression instanceof sqlNodes.Call) {
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
		} else if(expression && typeof expression === 'object') {
			for(var k in expression) {
				var v = expression[k];
				deep(v);
			}
		}
	};

	deep(expression);

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

SqlUtil.prototype.functionGetSource = function(fn) {
	return fn.toString().replace(/^\s*function[^(]*\([^(]*\)\s*\{\s*([\s\S]*?)\s*\}\s*$/, '$1');
};

exports.SqlUtil = SqlUtil;
