/**
 * Штука, которая парсит аргумент командной строки и создаёт функцию по следующим
 * правилам:
 * 1. Для аргументов вида ~\s*\{.*\}\s*~ код функции генерится как указано внутри {}
 * 2. Для всего остального генерится функция вида return DEFAULT_VARIABLE.$arg
 * @returns {undefined}
 */

function ArgFunction(string, args, defaultVariableName, options) {
	options = options || {};

	var m = string.match(/\s*\{(.*)\}\s*/);
	if(m) {
		// просто вариант - юзер указал весь код функции целиком
		return new Function(args.join(','), m[1] + (options.suffix || ''));
	}

	/*
	 * сложный вариант: юзер указал что-то вроде "field.subfield"
	 * надо конвертнуть это в function(args..) { return  $defaultVariableName.field.subfield }
	 */

	var src = 'return ' + defaultVariableName;

	if(string[0] === '[') {
		// не делаем ничего
	} else {
		src += '.';
	}

	src += string;

	return new Function(args.join(','), src);
};

//console.log((new ArgFunction('hello.world', ['r'], 'r')).toString());
//console.log((new ArgFunction('hello["world"]', ['r'], 'r')).toString());
//console.log((new ArgFunction('["world"]', ['r'], 'r')).toString());
//console.log((new ArgFunction('{return r.drop}', ['r'], 'r')).toString());

exports.ArgFunction = ArgFunction;
