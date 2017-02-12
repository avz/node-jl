node-jl
=====

Package is deprecated. Use [`jl-sql`](https://github.com/avz/jl-sql) instead
====

([Russian translation](README-RU.md))

Utility kit for working with JSON files/streams divided by `\n` symbol.
JSON-representation of each record shouldn't contain line breaking symbol.

Install
-----

```
npm install -g jl
```

Examples
-----

We have a log file `/tmp/test.json`, that contains next records
```json
{"ts": 1416595508, "type": "click"}
{"ts": 1416478467, "type": "buy", "price": 10}
{"ts": 1416466930, "type": "click"}
{"ts": 1416622653, "type": "buy", "price": 20}
{"ts": 1416699396, "type": "click"}
{"ts": 1416624334, "type": "click"}
{"ts": 1416518859, "type": "click"}
{"ts": 1416569870, "type": "click"}
{"ts": 1416573325, "type": "click"}
{"ts": 1416682270, "type": "click"}
```

### SQL-interface

`jl-sql` utility supports query language very similar to SQL
```sh
cat /tmp/test.json \
    | jl-sql 'SELECT type, COUNT(*) AS c, SUM(price) AS sum GROUP BY type ORDER BY c NUMERIC DESC'
```
```json
{"type":"click","c":8,"sum":0}
{"type":"buy","c":2,"sum":30}
```

As you can see we receive that we expect.

Please note non-standard keyword `NUMERIC` after `ORDER BY`:
without this keyword, sorting will be by string representation, not by numerical value.

#### Constants

- `NULL`
- `TRUE`
- `FALSE`

#### Operators

##### Arithmetic

- `+`
- `-`
- `*`
- `/`
- `%`

##### Comparison

- `=`, `==`
- `!=`
- `===` - Comparison with type check
- `!==` - Negative comparison with type check
- `>`
- `<`
- `>=`
- `<=`

##### Logical

- `AND`, `&&`
- `OR`, `||`
- `!`

#### Functions

##### Functions for working with data

- `FROM_UNIXTIME(unixTimestamp)` - converts unix timestamp to Date
- `UNIX_TIMESTAMP(date)` - converts Date to unix timestamp, date should be string in `'YYYY-MM-DD hh:mm:ss'` format
- `DATE(date)` - returns date in `'YYYY-MM-DD'` format

##### Misc

- `IF(expression, ifTrue, ifFalse)`
- `COALESCE(expression1[, expression2[, ...]])`

##### Aggregating

Right now, only very basic aggregating functions supported:

 - `SUM(expression)` - counts summary of field's values. Non-numerical values will be ignored
 - `MIN(expression)` - returns minimal field's value. Non-numerical values will be ignored
 - `MAX(expression)` - returns maximal field's value. Non-numerical values will be ignored
 - `COUNT(expression)` - counts amount of elements for which comparison with `expression` will be !== null or !== undefined
 - `COUNT(*)` - counts amount of elements
 - `HLL_COUNT_DISTINCT(arg1[, args2[, ...]])` - counts amount of unique argument combinations. Uses `O(1)` of memory and `O(N)` of CPU, but returns result with 0.1% error. For more information read [HyperLogLog](https://en.wikipedia.org/wiki/HyperLogLog) algorithm.

#### Restrictions

 - `JOIN` is not supported(and probably never will be)
 - Sorting by multiple fields is not supported
 - `LIMIT` is not supported, but could be replaced with `head` and `tail`

### Low-level interface

SQL-interface only wrapper for utility kit described down below.
By combining those utilities you can do much more than with SQL.

#### Filtering and aggregation

Let's filter only events with type `buy`
```sh
cat /tmp/test.json \
    | jl-filter 'type == "buy"'
```
```json
{"ts": 1416478467, "type": "buy", "price": 10}
{"ts": 1416622653, "type": "buy", "price": 20}
```

Add sum calculation for all `price` fields
```sh
cat /tmp/test.json \
    | jl-filter 'type == "buy"'
    | jl-sum price
```
```json
{"value":30}
```

To get just `30` you can add `jl-extract value` at the end - this command extract value of the field.

#### Sorting

Let sort log file by `ts` field
```sh
cat /tmp/test.json \
    | jl-sort ts
```
```json
{"ts": 1416466930, "type": "click"}
{"ts": 1416478467, "type": "buy", "price": 10}
{"ts": 1416518859, "type": "click"}
{"ts": 1416569870, "type": "click"}
{"ts": 1416573325, "type": "click"}
{"ts": 1416595508, "type": "click"}
{"ts": 1416622653, "type": "buy", "price": 20}
{"ts": 1416624334, "type": "click"}
{"ts": 1416682270, "type": "click"}
{"ts": 1416699396, "type": "click"}
```

The standard arguments of `sort` utility is also supported: `-r`, `-n`, `-u`, `-m`, `-s`, `-T`, `-S`

#### Modification

Let's add to each object field `date`, that contains event date in UTC format
```sh
cat /tmp/test.json \
    | jl-transform '{r.date = (new Date(r.ts * 1000)).toUTCString()}'
```
```json
{"ts":1416595508,"type":"click","date":"Fri, 21 Nov 2014 18:45:08 GMT"}
{"ts":1416478467,"type":"buy","price":10,"date":"Thu, 20 Nov 2014 10:14:27 GMT"}
{"ts":1416466930,"type":"click","date":"Thu, 20 Nov 2014 07:02:10 GMT"}
{"ts":1416622653,"type":"buy","price":20,"date":"Sat, 22 Nov 2014 02:17:33 GMT"}
{"ts":1416699396,"type":"click","date":"Sat, 22 Nov 2014 23:36:36 GMT"}
{"ts":1416624334,"type":"click","date":"Sat, 22 Nov 2014 02:45:34 GMT"}
{"ts":1416518859,"type":"click","date":"Thu, 20 Nov 2014 21:27:39 GMT"}
{"ts":1416569870,"type":"click","date":"Fri, 21 Nov 2014 11:37:50 GMT"}
{"ts":1416573325,"type":"click","date":"Fri, 21 Nov 2014 12:35:25 GMT"}
{"ts":1416682270,"type":"click","date":"Sat, 22 Nov 2014 18:51:10 GMT"}
```

Internal pipe
-----

The system pipes are inefficient because of serialization/deserialization of JSON each time when working with multiple `jl-`utilities because each utility receives and returns JSON using stdin/stdout.

To solve this problem `jl-`utilities supports internal piping which allows to multiple utilities interact with each other in the context of a single process without spending resources for parsing. To use internal pipes replace `|`  to `\|` between `jl-`commands in the command line. For example:
```sh
cat /tmp/test.json \
    | jl-filter 'type == "buy"'
    | jl-sum price
```
you can change to:
```sh
cat /tmp/test.json \
    | jl-filter 'type == "buy"'
    \| jl-sum price
```

Performance
-----

CPU consumption of all utilities except for `jl-sort` is `O(n)`, by memory is `O(1)`.

The performance of `jl-sort` completely depends on system's `sort` realization, additional CPU consumptions also `O(n)`, and by memory `O(1)`.

By using internal pipes significantly increases performance because JSON parsing is very expensive operation.
But in another hand, all operations in pipes is computing in a single thread, so with very long pipes you should keep the balance.

Utilities
-----

#### `jl-sql` - SQL

Requires single argument - SQL and has few options:

- `-T DIR` - temporary directory which will be used for sorting if it didn't use RAM. `$TMPDIR` or `/tmp` by default. Pay attention when sorting big amount of data, by having `/tmp` on the RAM disk.
- `-S BUF` - size of sorting buffer in bytes. On buffer overflow, filesystem will be used(see `-T` option)


#### `jl-sort` - sorting

Wrapper for GNU Sort, allowing to sort JSON. Uses all advantages of `sort`, also, supports sorting in filesystem, merge-sort, stable sorting, limit buffer size.

#### `jl-filter` - filtering

Alternative to `grep`, but for JSON.

#### `jl-reduce` - aggregation and grouping by key

General utility that produces welding elements into a single value for each group.
Expects 3 JS-functions arguments:

- `-i FUNC` - accumulator initialization: gets called for each group. The function executes in a group context.
- `-u FUNC` - accumulator update: the function that will be executed for each element of a group.
The function executes in a group context and receives argument `r`, containing each element of a thread.
- `-r FUNC` - received accumulator's value: will be executed at the end of group with the passed result. The function executes in a group context.

and one required argument

- `-k KEYDEF` - key which will be used for grouping, could be a function. For correct execution thread's input should be sorted by this key in any direction.

Here is simple example of using `jl-sum` utility, which counts sum for `amount` field for each user that gets identified by `uid` field:

```sh
jl-reduce -k uid -i '{this.sum = 0}' -u '{this.sum += r.amount}' -r '{return this.sum}'
```

For thread's input containing:
```json
{"uid": 1, "amount": 10}
{"uid": 1, "amount": 11}
{"uid": 2, "amount": 12}
{"uid": 3, "amount": 13}
```

Output will be:
```json
{"key":1,"value":21}
{"key":2,"value":12}
{"key":3,"value":13}
```

If `-k` argument will be missing, convolution will go over whole thread and will return:
```json
{"value":46}
```

#### `jl-sum` - summation

Predefined `jl-reduce`, which counts sum of parameter in group

#### `jl-count` - подсчёт количества

Predefined `jl-reduce`, which counts amount of elements in group

#### `jl-transform` - modification
#### `jl-extract` - field's value extraction
#### `jl-from-csv` - CSV to JSON conversation
#### `jl-plainify` - Flattens object to a single level deep k-v
