function Router() {

};

Router.runFromShell = function(command) {
	var u = Router.needUtil(command);

	u.runFromShell();
};

Router.needUtil = function(command) {
	var routes = {
		sort: require('./util/SortUtil.js').SortUtil,
		filter: require('./util/FilterUtil.js').FilterUtil,
		grep: require('./util/FilterUtil.js').FilterUtil,
		transform: require('./util/TransformUtil.js').TransformUtil
	};

	var r = command.replace(/^jp-/, '');

	var ctor = routes[r];

	if(!ctor)
		throw new Error('Command not found: ' + command);

	return new ctor;
};

exports.Router = Router;
