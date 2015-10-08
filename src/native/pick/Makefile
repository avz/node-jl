CXX?=c++
LD=$(CXX)

PROJECT=jl-pick

OBJS=main.o
VPATH=src

CFLAGS?=-O2

build: $(PROJECT)

$(PROJECT): $(OBJS)
	$(LD) -lc $(LDFLAGS) $(OBJS) -o "bin/$(PROJECT)"

.cpp.o:
	$(CXX) -c -g -Winline -Wall -Wconversion -D_GNU_SOURCE -D_FILE_OFFSET_BITS=64 $(CFLAGS) src/$*.cpp

clean:
	rm -f *.o "bin/$(PROJECT)"

install: build
	install "bin/$(PROJECT)" "$(PREFIX)/bin"

test:
	sh tests/all.sh
