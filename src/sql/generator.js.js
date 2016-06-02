function GeneratorJs(rowNamespace, functionsNamespace) {
	this.rowNamespace = rowNamespace;
	this.functionsNamespace = functionsNamespace;
};

GeneratorJs.prototype.fromAst = function(ast, select, unwrapAliases) {
	var type = ast.getNodeType();

	if(!this[type])
		throw new Error('Unknown node type: ' + type);

	if (type === 'ColumnIdent' && unwrapAliases && select) {
		var requestedAlias = ast.fragments.join('.');

		for (var i = 0; i < select.columns.length; i++) {
			var c = select.columns[i];

			var name = this.getColumnName(c);
			if (!name) {
				name = 'col_' + i;
			}

			if (!c.alias) {
				continue;
			}

			if (name === requestedAlias && ast !== c.expression) {
				return this.fromAst(c.expression, select);
			}
		}
	}

	return this[type](ast, select, unwrapAliases);
};

GeneratorJs.prototype.getColumnName = function(ast) {
	if(ast.alias)
		return ast.alias.name;

	if(ast.expression.getNodeType() === 'ColumnIdent')
		return ast.expression.fragments[ast.expression.fragments.length - 1];

	return null;
};

GeneratorJs.prototype.Select = function(ast) {
	var self = this;
	var args = [this.rowNamespace, this.functionsNamespace];

	var columnNamesArray = [];
	var columnValuesObjectCode = [];

	var valuesArrayFunction;
	var valuesObjectFunction;

	var fromAstUnwrappedBinded = function(childAst) {
		return self.fromAst(childAst, ast, true);
	};

	if(ast.columns) {
		var columnValuesArrayCode = [];

		for(var i = 0; i < ast.columns.length; i++) {
			var c = ast.columns[i];

			var name = '' + (this.getColumnName(c) || i);
			var code = this.fromAst(c.expression, ast);

			columnNamesArray.push(name + '');
			columnValuesArrayCode.push(code);
			columnValuesObjectCode.push(JSON.stringify(name) + ': ' + code);
		}

		valuesArrayFunction = new Function(args, 'return [' + columnValuesArrayCode.join(', ') + '];');
		valuesObjectFunction = new Function(args, 'return {' + columnValuesObjectCode.join(', ') + '};')
	} else {
		// кейс для SELECT * FROM ...
		valuesObjectFunction = function(r) { return r };
		valuesArrayFunction = function(r) { throw new Error('Array-based rows is not dupported in "SELECT * ..." queries') };
	}

	var groupByFunction = null;
	var groupByFunctionJson = null;

	if(ast.groups.length) {
		groupByFunction = new Function(args, 'return [' + ast.groups.map(fromAstUnwrappedBinded).join(', ') + '];');
		groupByFunctionJson = new Function(args, 'return JSON.stringify([' + ast.groups.map(fromAstUnwrappedBinded).join(', ') + ']);');
	}

	var orderByFunction = null;

	if(ast.orders.length)
		orderByFunction = new Function(args, 'return [' + ast.orders.map(fromAstUnwrappedBinded).join(', ') + '];');

	return {
		row: {
			columns: columnNamesArray,
			valuesArray: valuesArrayFunction,
			valuesObject: valuesObjectFunction
		},
		where: ast.where ? new Function(args, 'return ' + fromAstUnwrappedBinded(ast.where) + ';') : null,
		groupBy: groupByFunction,
		groupByJson: groupByFunctionJson,
		orderBy: orderByFunction
	};
};

GeneratorJs.prototype.ColumnIdent = function(ast, select, unwrapAliases) {
	return this.ComplexIdent(ast, select, unwrapAliases);
};

GeneratorJs.prototype.FunctionIdent = function(ast, select, unwrapAliases) {
	return this.functionsNamespace + '[' + ast.fragments.map(JSON.stringify).join('][') + ']';
};

GeneratorJs.prototype.ComplexIdent = function(ast, select, unwrapAliases) {
	this.rowNamespace = 'r';

	var namespace = this.rowNamespace;
	var checks = [];

	var getJsIdent = function(path) {
		return namespace + '[' + path.map(JSON.stringify).join('][') + ']'
	};

	for(var i = 0; i < ast.fragments.length - 1; i++) {
		var segs = ast.fragments.slice(0, i + 1);

		var p = getJsIdent(segs);
		checks.push(p + ' !== null');
		checks.push(p + ' !== undefined');
	}

	if(checks.length)
		return '((' + checks.join(' && ') + ') ? ' + getJsIdent(ast.fragments) + ' : undefined)';
	else
		return getJsIdent(ast.fragments);
};

GeneratorJs.prototype.Number = function(ast) {
	return ast.value + '';
};

GeneratorJs.prototype.Boolean = function(ast) {
	return ast.value ? 'true' : 'false';
};

GeneratorJs.prototype.String = function(ast) {
	return "'" + ast.value + "'";
};

GeneratorJs.prototype.Call = function(ast, select, unwrapAliases) {
	var n = this.fromAst(ast.function, select, unwrapAliases);
	var a = [];

	for(var i = 0; i < ast.args.length; i++) {
		a.push(this.fromAst(ast.args[i], select, unwrapAliases));
	}

	return n + '(' + a.join(', ') + ')';
};

GeneratorJs.prototype.Order = function(ast, select, unwrapAliases) {
	return this.fromAst(ast.expression, select, unwrapAliases);
};

GeneratorJs.prototype.UnaryOperation = function(ast, select, unwrapAliases) {
	return ast.operator + '' + this.fromAst(ast.right, select, unwrapAliases);
};

GeneratorJs.prototype.BinaryOperation = function(ast, select, unwrapAliases) {
	return this.fromAst(ast.left, select, unwrapAliases) + ' ' + ast.operator + ' ' + this.fromAst(ast.right, select, unwrapAliases);
};

GeneratorJs.prototype.ComparsionOperation = function(ast, select, unwrapAliases) {
	var map = {
		AND: '&&',
		OR: '||',
		'=': '=='
	};

	var op = map[ast.operator] ? map[ast.operator] : ast.operator;

	return '!!'  + '(' + this.fromAst(ast.left, select, unwrapAliases) + ' ' + op + ' ' + this.fromAst(ast.right, select, unwrapAliases) + ')';
};

GeneratorJs.prototype.In = function(ast, select, unwrapAliases) {
	var w = [];
	var n = this.fromAst(ast.needle);

	for(var i = 0; i < ast.haystack.length; i++) {
		var e = ast.haystack[i];
		w.push(n + ' == ' + this.fromAst(e, select, unwrapAliases));
	}

	return '(' + w.join(' || ') + ')';
};

GeneratorJs.prototype.Brackets = function(ast, select, unwrapAliases) {
	return '(' + this.fromAst(ast.expression, select, unwrapAliases) + ')';
};

GeneratorJs.prototype.Null = function(ast, select, unwrapAliases) {
	return 'null';
};

exports.GeneratorJs = GeneratorJs;
