#ifndef PARSER_HPP
#define PARSER_HPP

#include <stdio.h>
#include <sys/types.h>
#include <string.h>

class JsonToken {
public:
	enum Type {
		None = 0,
		Null = 'n',
		True = 't',
		False = 'f',
		String = '"',
		MapStart = '{',
		MapEnd = '}',
		ListStart = '[',
		ListEnd = ']',
		Comma = ',',
		Colon = ':',
		Number = '1'
	} type;

	const void *start;
	size_t len;

	JsonToken(): type(None), start(NULL), len(0) {};

	void dump() const {
		switch(type) {
			case Null:
				fprintf(stderr, "Node 'null'\n");
			break;
			case True:
				fprintf(stderr, "Node 'true'\n");
			break;
			case False:
				fprintf(stderr, "Node 'false'\n");
			break;
			case String:
				fprintf(stderr, "Node 'string'[%u]: ", (unsigned int)len);
				fwrite(start, len, 1, stderr);
				fprintf(stderr, "\n");
			break;
			case Number:
				fprintf(stderr, "Node 'number'[%u]: ", (unsigned int)len);
				fwrite(start, len, 1, stderr);
				fprintf(stderr, "\n");
			break;
			default:
				fprintf(stderr, "Node '%c'\n", (unsigned char)type);
		}
	}
};

class JsonTokenizer {
	const char *pos;
	const char *end;

	JsonToken currentNode;

	inline void earnSpaces() {
		while(pos < end && (*pos == ' ' || *pos == '\t' || *pos == '\r' || *pos == '\n'))
			pos++;
	}

	inline void needLen(size_t len) {
		if((size_t)(end - pos) < len)
			throw "Unexpected end of data";
	}

	template <size_t l> inline void earnConst(const char (&str)[l]) {
		// сделать спецификацию шаблона для оптимизации.
		// Этот метод используется только для 3-х и 4-х байтных строк

		needLen(l - 1);

		if(memcmp(pos, str, l - 1) != 0)
			throw "Unexpected identifier";

		pos += l - 1;
	}

	inline void earnString() {
		bool completed = false;
		bool escaped = false;

		currentNode.type = JsonToken::String;
		currentNode.start = pos;
		pos++; // Пропускаем стартовый "

		while(pos != end) {
			if(escaped) {
				pos++;
				escaped = false;
				continue;
			} else if(*pos == '\\') {
				pos++;
				escaped = true;
				continue;
			} else if(*pos == '"') {
				completed = true;
				break;
			}

			pos++;
		}

		if(!completed)
			throw "Unexpected end of string";

		pos++;

		currentNode.len = (size_t)(pos - (const char *)currentNode.start);
	}

	inline void earnNumber() {
		currentNode.start = pos;
		currentNode.type = JsonToken::Number;

		while(pos != end) {
			char chr = *pos;
//			fprintf(stderr, "Char: %c\n", chr);
			if(!(
				(chr >= '0' && chr <= '9')
				|| chr == '-' || chr == '+' || chr == 'E' || chr == 'e' || chr == '.'
			)) {
				break;
			}

			pos++;
		}

		if(pos == currentNode.start)
			throw "Number expected";

		currentNode.len = (size_t)(pos - (const char *)currentNode.start - 1);
	}

	inline bool isEnd() {
		return pos >= end;
	}

	inline bool readNext() {
		earnSpaces();

		if(isEnd())
			return false;

		currentNode.start = pos;

//		fprintf(stderr, "%c\n", *pos);
		switch(*pos) {
			case 'n':
				pos++;
				currentNode.type = JsonToken::Null;

				earnConst("ull");
			break;
			case 't':
				pos++;
				currentNode.type = JsonToken::True;

				earnConst("rue");
			break;
			case 'f':
				pos++;
				currentNode.type = JsonToken::False;

				earnConst("alse");
			break;
			case '"':
				earnString();
			break;
			case '{':
				currentNode.type = JsonToken::MapStart;
				pos++;
			break;
			case '}':
				currentNode.type = JsonToken::MapEnd;
				pos++;
			break;
			case '[':
				currentNode.type = JsonToken::ListStart;
				pos++;
			break;
			case ']':
				currentNode.type = JsonToken::ListEnd;
				pos++;
			break;
			case ',':
				currentNode.type = JsonToken::Comma;
				pos++;
			break;
			case ':':
				currentNode.type = JsonToken::Colon;
				pos++;
			break;
			default:
				// тут может буть только число
				earnNumber();
			break;
		}

		return true;
	}

public:
	JsonTokenizer(const void *buf, size_t len)
		: pos((const char *)buf)
		, end((const char *)buf + len)
	{
	}

	inline const JsonToken *next() {
		if(readNext()) {
//			currentNode.dump();
			return &currentNode;
		}

		return NULL;
	}
};

#endif
