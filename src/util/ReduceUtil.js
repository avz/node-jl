function ReduceUtil() {
	ReduceUtil.super_.call(this, [
		['k', 'key=KEYDEF', 'group key'],
		['i', 'init=FUNC', 'init callback'],
		['u', 'update=FUNC', 'update callback'],
		['r', 'result=FUNC', 'result callback'],
//		['v', 'value=FUNC', 'value callback (for internal usage)'],
	], '-i FUNC -u FUNC -r FUNC');
};

require('util').inherits(ReduceUtil, require('../Util.js').Util);

ReduceUtil.prototype.run = function() {
	var tr = this.jp._createObjectsTransform('object', false);
	var jp = this.jp;

	var getGroupKey = this.getOptionFunction('key');

	var init = this.needOptionFunction('init', ['env']);
	var update = this.needOptionFunction('update', ['r', 'value', 'env']);
	var result = this.needOptionFunction('result', ['env']);

	var valueCb = null;
	/* эта штука ставится только из sum/count и прочих агрегатов, наботающих на базе reduce */
	if(this.getOption('get-value-from-args0')) {
		valueCb = this.needArgumentFunction(0);
		this.shiftArguments();
	}

	var inputStream = this.getConcatenatedInputObjectsStream();

	var group = null;

	var flushGroup = function() {
		if(group) {
			tr.push([{
				key: group.key,
				value: result.call(group, jp.env)
			}]);
		}
	};

	if(getGroupKey) {
		tr._transform = function(chunk, encoding, callback) {
			for(var i = 0; i < chunk.length; i++) {
				var item = chunk[i];

				var groupKey = getGroupKey(item, jp.env);

				if(group) {
					if(group.key !== groupKey) {
						flushGroup();
						group = null;
					}
				}

				if(!group) {
					group = {
						key: groupKey
					};

					init.call(group, jp.env);
				}

				update.call(group, item, valueCb, jp.env);
			}

			callback();
		};
	} else {
		group = {};
		init.call(group, jp.env);

		tr._transform = function(chunk, encoding, callback) {
			for(var i = 0; i < chunk.length; i++) {
				update.call(group, chunk[i], valueCb, jp.env);
			}
			callback();
		};
	}

	tr._flush = function(callback) {
		flushGroup();
		callback();
	};

	return inputStream.pipe(tr);
};

exports.ReduceUtil = ReduceUtil;
