function SumUtil() {
	var u = require('../Router.js').Router.needUtil('reduce');

	u.overrideOption('get-value-from-args0', true);

	u.overrideOption('init', function() {
		this.sum = 0;
	});

	u.overrideOption('update', function(r, valueCb) {
		var v = valueCb(r);
		var number = parseFloat(v);

		if(!isNaN(number))
			this.sum += number;
	});

	u.overrideOption('result', function() {
		return this.sum;
	});

	return u;
};

exports.SumUtil = SumUtil;
