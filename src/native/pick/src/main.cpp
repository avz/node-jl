#include <stdlib.h>
#include <stdio.h>
#include <unistd.h>

#include <vector>
#include <list>
#include <string>

#include "parser.hpp"

#define STRINGIFY(x) #x
#define TOSTRING(x) STRINGIFY(x)

#define AT __FILE__ ":" TOSTRING(__LINE__)

class JsonPathSegment {
public:
	const char *ptr;

	union {
		size_t len;
		size_t num;
	};

	JsonPathSegment(const void *ptr, size_t len)
		: ptr((const char *)ptr)
		, len(len)
	{

	}

	JsonPathSegment(size_t num)
		: ptr(NULL)
		, num(num)
	{

	}

	inline bool operator==(const JsonPathSegment &s) const {
		if(ptr) {
			if(!s.ptr)
				return false;

			if(len != s.len)
				return false;

			return memcmp(ptr, s.ptr, len) == 0;
		} else {
			return len == s.len;
		}
	}
};

class JsonPath {
	static char num2stringBuf[32];

	std::vector<JsonPathSegment> segments;

public:

	inline void push(const JsonPathSegment &key) {
		segments.push_back(key);
	}

	inline void push(const void *ptr, size_t len) {
		segments.push_back(JsonPathSegment(ptr, len));
	}

	inline void push(const void *str) {
		push(str, strlen((const char *)str));
	}

	inline void push(size_t number) {
		int len = snprintf(num2stringBuf, sizeof(num2stringBuf), "%llu", (long long unsigned)number);

		segments.push_back(JsonPathSegment(num2stringBuf, (size_t)len));
	}

	inline void pop() {
		segments.pop_back();
	}

	inline size_t size() {
		return segments.size();
	}

	void dump() const {
		for(std::vector<JsonPathSegment>::const_iterator it = segments.begin(); it != segments.end(); ++it) {
			const JsonPathSegment &s = *it;

			fputs(".", stderr);

			if(s.ptr) {
				fwrite(s.ptr, s.len, 1, stderr);
			} else {
				fputs("@", stderr);
			}
		}

		fprintf(stderr, "\n");
	}

	JsonPath() {
		segments.reserve(20);
	}

	inline bool operator==(const JsonPath &path) const {
		if(path.segments.size() != segments.size())
			return false;

		for(size_t i = 0; i < segments.size(); i++) {
			if(!(segments[i] == path.segments[i]))
				return false;
		}

		return true;
	}
};

class PathMatcher {
	std::vector<JsonPath> list;
	std::vector<JsonPath> origList;

public:
	void add(const JsonPath &path) {
		list.push_back(path);
		origList.push_back(path);
	}

	inline bool matchDelete(const JsonPath &path) {
		for(size_t i = 0; i < list.size(); i++) {
			if(list[i] == path) {
				list.erase(list.begin() + (long)i);
				return true;
			}
		}

		return false;
	}

	bool empty() {
		return list.empty();
	}

	void reset() {
		list = origList;
	}
};

class JsonPicker {
	char *buf;
	size_t bufLen;

	char *front;
	char *back;

	PathMatcher matcher;

	inline const JsonToken *earnToken(
		JsonTokenizer *tokenizer,
		JsonToken::Type expectedType1 = JsonToken::None,
		JsonToken::Type expectedType2 = JsonToken::None
	) {
		const JsonToken *t = tokenizer->next();

		if(!t)
			throw "Unexpected end of data [" AT "]";

		if(
			(expectedType1 != JsonToken::None && t->type != expectedType1)
			&&
			(expectedType2 != JsonToken::None && t->type != expectedType2)
		) {
			throw "Unexpected node [" AT "]";
		}

		return t;
	}

	bool earnMap(JsonTokenizer *tokenizer, JsonPath *path, bool parentMatched) {
		bool anyMatched = false;
		const JsonToken *t;

		if(!parentMatched)
			writeBack('{');

		while((t = earnToken(tokenizer, JsonToken::String, JsonToken::MapEnd))) {
			if(t->type == JsonToken::MapEnd)
				break;

			const char *keyStart = (const char *)t->start;
			bool keyMatched = false;
			bool valueMatched = false;

			path->push(t->start, t->len);

			if(matcher.matchDelete(*path)) {
				keyMatched = true;
				anyMatched = true;
			}

			t = earnToken(tokenizer, JsonToken::Colon);

			size_t keyJsonLen = (size_t)((const char *)t->start - (const char *)keyStart + 1);
			const char *keyJsonEnd = keyStart + keyJsonLen;

			if(!parentMatched)
				writeBack(keyStart, keyJsonLen);

			t = earnToken(tokenizer);
			if(next(t, tokenizer, path, parentMatched || keyMatched)) {
				valueMatched = true;
				anyMatched = true;
			}

			path->pop();

			t = tokenizer->next();

			if(!parentMatched) {
				if(keyMatched) {
					writeBack(keyJsonEnd, (size_t)((const char *)t->start - keyJsonEnd));
					writeBack(',');
				} else if(valueMatched) {
					writeBack(',');
				} else {
					popBack(keyJsonLen);
				}
			}

			if(t->type == JsonToken::MapEnd) {
				break;
			} else if(t->type == JsonToken::Comma) {
				continue;
			} else {
				throw "Unexpected node [" AT "]";
			}
		}

		if(!parentMatched) {
			if(anyMatched) {
				popBack(1); // trailing comma
				writeBack('}');
			} else {
				popBack(1); // leading "{"
			}
		}

		return anyMatched;
	}

	bool earnList(JsonTokenizer *tokenizer, JsonPath *path, bool parentMatched) {
		bool anyMatched = false;
		const JsonToken *t;

		if(!parentMatched)
			writeBack('[');

		path->push("@", 1); // у всех чайлдов одинаковый путь

		while((t = earnToken(tokenizer))) {
			if(t->type == JsonToken::ListEnd)
				break;

			bool valueMatched = false;

			if(next(t, tokenizer, path, parentMatched)) {
				valueMatched = true;
				anyMatched = true;
			}

			t = tokenizer->next();

			if(!parentMatched && valueMatched) {
				writeBack(',');
			}

			if(t->type == JsonToken::ListEnd) {
				break;
			} else if(t->type == JsonToken::Comma) {
				continue;
			} else {
				throw "Unexpected node [" AT "]";
			}
		}

		path->pop();

		if(!parentMatched) {
			if(anyMatched) {
				popBack(1); // trailing comma
				writeBack(']');
			} else {
				popBack(1); // leading "["
			}
		}

		return anyMatched;
	}

	inline bool next(const JsonToken *token, JsonTokenizer *tokenizer, JsonPath *path, bool matched) {
		switch(token->type) {
			case JsonToken::MapStart:
				return earnMap(tokenizer, path, matched);
			break;
			case JsonToken::ListStart:
				return earnList(tokenizer, path, matched);
			break;
			case JsonToken::String:
			case JsonToken::Number:
			case JsonToken::Null:
			case JsonToken::True:
			case JsonToken::False:
			break;
			default:
				throw "Unexpected token [" AT "]";
		}

		return false;
	}

	void writeBack(const char chr) {
		*back = chr;
		back++;
	}

	void popBack(size_t len) {
		back -= len;
	}


	void writeBack(const void *start, size_t len) {
		memcpy(back, start, len);
		back += len;
	}

	void initBuf(size_t len) {
		if(!buf) {
			bufLen = len * 2;
			buf = (char *)malloc(bufLen);
		} else {
			if(bufLen < len * 2) {
				bufLen = len * 2;
				buf = (char *)realloc(buf, bufLen);
			}
		}

		front = buf + len;
		back = buf + len;
	}

	void flushBuf() {
		if(front == back) {
			puts("{}");
		} else {
			fwrite(front, (size_t)(back - front), 1, stdout);
			puts("");
		}
	}

public:
	JsonPicker()
		: buf(NULL)
		, bufLen(0)
		, front(NULL)
		, back(NULL)
	{
	}

	void addPath(const JsonPath &path) {
		matcher.add(path);
	}

	~JsonPicker() {
		if(buf)
			free(buf);
	}

	void pick(const void *ptr, size_t len) {
		matcher.reset();

		JsonTokenizer p(ptr, len);
		JsonPath path;
		const JsonToken *t = NULL;

		initBuf(len);

		t = p.next();
		if(!t || (t->type != JsonToken::MapStart && t->type != JsonToken::ListStart)) {
			flushBuf();
			return;
		}

		next(t, &p, &path, false);

		flushBuf();
	}
};

void usage(const char *cmd) {
	fprintf(stderr, "Usage: %s [-I] path1 [ path2 [...]]]\n", cmd);
}

int main(int argc, char *argv[]) {
	char line[1024 * 16];
	JsonPicker p;
	std::list<std::string> segs;

	bool ignoreJsonErrors = false;
	int opt;

	while((opt = getopt(argc, argv, "I")) != -1) {
		switch(opt) {
			case 'I':
				ignoreJsonErrors = true;
			break;
			default:
				usage(argv[0]);
				exit(255);
		}
	}

	if(optind >= argc) {
		usage(argv[0]);
		exit(255);
	}

	for(int i = optind; i < argc; i++) {
		JsonPath path;
		char *token;

		token = strtok(argv[i], ".");
		while(token) {
			std::string seg;
			seg.append("\"");
			seg.append(token);
			seg.append("\"");
			segs.push_back(seg);

			path.push(segs.back().c_str());
			token = strtok(NULL, ".");
		}

		p.addPath(path);
	}

	while(fgets(line, sizeof(line), stdin)) {

		try {
			p.pick(line, strlen(line));
		} catch(const char *str) {
			fprintf(stderr, "ERROR  \"%s\". JSON: %s", str, line);

			if(!ignoreJsonErrors)
				exit(1);
		}

	}

	return 0;
}
