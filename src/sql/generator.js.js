function GeneratorJs(rowNamespace, functionsNamespace) {
	this.rowNamespace = rowNamespace;
	this.functionsNamespace = functionsNamespace;
};

GeneratorJs.prototype.fromAst = function(ast, select, unwrapAliases) {
	var type = ast.getNodeType();

	if(!this[type])
		throw new Error('Unknown node type: ' + type);

	if (type === 'ColumnIdent' && unwrapAliases && select) {
		for (var i = 0; i < select.columns.length; i++) {
			var c = select.columns[i];

			if (!c.alias) {
				continue;
			}

			return this.fromAst(c.expression);
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

GeneratorJs.prototype.ColumnIdent = function(ast) {
	return this.ComplexIdent(ast);
};

GeneratorJs.prototype.FunctionIdent = function(ast) {
	return this.functionsNamespace + '[' + ast.fragments.map(JSON.stringify).join('][') + ']';
};

GeneratorJs.prototype.ComplexIdent = function(ast) {
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

GeneratorJs.prototype.String = function(ast) {
	return "'" + ast.value + "'";
};

GeneratorJs.prototype.Call = function(ast) {
	var n = this.fromAst(ast.function);
	var a = [];

	for(var i = 0; i < ast.args.length; i++) {
		a.push(this.fromAst(ast.args[i]));
	}

	return n + '(' + a.join(', ') + ')';
};

GeneratorJs.prototype.Order = function(ast) {
	return this.fromAst(ast.expression);
};

GeneratorJs.prototype.UnaryOperation = function(ast) {
	return ast.operator + '' + this.fromAst(ast.right);
};

GeneratorJs.prototype.BinaryOperation = function(ast) {
	var map = {
		AND: '&&',
		OR: '||',
		'=': '=='
	};

	var op = map[ast.operator] ? map[ast.operator] : ast.operator;

	return this.fromAst(ast.left) + ' ' + op + ' ' + this.fromAst(ast.right);
};

GeneratorJs.prototype.In = function(ast) {
	var w = [];
	var n = this.fromAst(ast.needle);

	for(var i = 0; i < ast.haystack.length; i++) {
		var e = ast.haystack[i];
		w.push(n + ' == ' + this.fromAst(e));
	}

	return '(' + w.join(' || ') + ')';
};

GeneratorJs.prototype.Brackets = function(ast) {
	return '(' + this.fromAst(ast.expression) + ')';
};

GeneratorJs.prototype.Null = function(ast) {
	return 'null';
};

exports.GeneratorJs = GeneratorJs;
