function Router() {

};

Router.runFromShell = function(command, argv) {
	if(!argv)
		argv = process.argv;

	var u = Router.needUtil(command);

	u.runFromShell(argv);

	return u;
};

Router.needUtil = function(command) {
	var routes = {
		sort: require('./util/SortUtil.js').SortUtil,
		count: require('./util/CountUtil.js').CountUtil,
		sum: require('./util/SumUtil.js').SumUtil,
		filter: require('./util/FilterUtil.js').FilterUtil,
		grep: require('./util/FilterUtil.js').FilterUtil,
		transform: require('./util/TransformUtil.js').TransformUtil,
		reduce: require('./util/ReduceUtil.js').ReduceUtil,
		extract: require('./util/ExtractUtil.js').ExtractUtil,
		plainify: require('./util/PlainifyUtil.js').PlainifyUtil,
		'from-csv': require('./util/FromCsvUtil.js').FromCsvUtil
	};

	var r = command.replace(/^jl-/, '');

	var ctor = routes[r];

	if(!ctor)
		throw new Error('Command not found: ' + command);

	return new ctor;
};

exports.Router = Router;
