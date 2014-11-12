#!/bin/sh

if [ "$1" = 'recs' ]; then
	recs-chain \
	recs-grep '{{uid}}' \
		\| recs-grep '{{uid}}' \
		\| recs-xform '$r->{test} = "hello"' \
		\| recs-grep '$r->{test} eq "hello"' \
		\| recs-xform '$r->{test} = "hello1"' \
		\| recs-grep '$r->{test} eq "hello"'
elif [ "$1" = 'jp' ]; then
	node $(dirname $0)/bin/filter.js uid \
		\| jp-filter uid \
		\| jp-transform '{r.test = "hello"}' \
		\| jp-filter 'test==="hello"' \
		\| jp-transform '{r.test = "hello1"}'\
		\| jp-filter 'test==="hello1"'
else
	exit 255
fi
