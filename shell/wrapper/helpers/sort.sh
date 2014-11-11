#!/bin/sh

(echo '=== Input ===' >&2; tee /dev/stderr; echo '=== Output ===' >&2) \
	| sort "$@" | cut -f 2-
