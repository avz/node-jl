function CountUtil() {
	var u = require('../Router.js').Router.needUtil('reduce');

	u.overrideOption('init', function() {
		this.count = 0;
	});

	u.overrideOption('update', function() {
		this.count++;
	});

	u.overrideOption('result', function() {
		return this.count;
	});

	return u;
};

exports.CountUtil = CountUtil;
