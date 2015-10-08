node-jl
=====

Набор утилит для работы с файлами/потоками, содержащими JSON-записи, разделённые символом перевода строки (`\n`).
JSON-представление каждой записи не должно иметь переводов строки.

Установка
-----

```
npm --unsafe-perm=true install -g jl
```

Внимание! Опция `--unsafe-perm=true` необходима для сборки бинарника, который исспользуется для ускорения
`jl-sql`.

Примеры использования
-----

Имеет лог-файл `/tmp/test.json`, содержащий такие записи
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

### SQL-интерфейс

Утилита `jl-sql` поддерживает язык запросов, очень похожий на SQL
```sh
cat /tmp/test.json \
	| jl-sql 'SELECT type, COUNT(*) AS c, SUM(price) AS sum GROUP BY type ORDER BY c NUMERIC DESC'
```
```json
{"type":"click","c":8,"sum":0}
{"type":"buy","c":2,"sum":30}
```

Как видим, на выходе получаем ровно то, что ожидаем.

Обратите внимание на нестандартное ключевое слово `NUMERIC` в `ORDER BY`:
без него сортировка будет идти не по числовому значению поля, а по его строковому представлению.

На данный момент поддерживаются только самые базовые агрегирующие функции:

 - `SUM(expression)` - считает сумму значений поля. Нечисловые начения пропускаются
 - `MIN(expression)` - считает минимальное значение поля. Нечисловые начения пропускаются
 - `MAX(expression)` - считает максимальное значение поля. Нечисловые начения пропускаются
 - `COUNT(expression)` - считает количество элементов, значение `expression` для который !== null и !== undefined
 - `COUNT(*)` - считает количество элементов
 - `HLL_COUNT_DISTINCT(arg1[, args2[, ...]])` - считает количество уникальных комбинаций аргументов. Потреляет `O(1)` памяти и `O(N)`
вычислительной сложности, но даёт результат со стандартной ошибку 0.1%. Для подробностей можно почитать про алгоритм HyperLogLog

#### Ограничния

 - нет и, скорее всего, никогда не будет `JOIN`
 - не поддерживается сортировка по нескольким полям одновременно
 - поля, не перечисленные в списке `SELECT`, не будут видны из `ORDER BY`
 - не поддерживается `LIMIT`, но его легко заменить обычными `head` и `tail`

### Низкоуровневый интерфейс

SQL-интерфейс является всего лишь надстройкой над набором утилит, описанных ниже.
Комбинируя эти утилиты, можно делать намного больше, чем позволяет SQL.

#### Фильтрация и агрегация

Отфильтруем только события с типом `buy`
```sh
cat /tmp/test.json \
	| jl-filter 'type == "buy"'
```
```json
{"ts": 1416478467, "type": "buy", "price": 10}
{"ts": 1416622653, "type": "buy", "price": 20}
```

Добавим подсчёт суммы всех `price`
```sh
cat /tmp/test.json \
	| jl-filter 'type == "buy"'
	| jl-sum price
```
```json
{"value":30}
```

Чтобы получить просто `30` можно добавить в конце вызов `jl-extract value` - эта команда извлекает строковое представление значения поля.

#### Сортировка

Отсортируем лог по полю `ts`
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

Также поддерживаются стандартные аргументы утилиты `sort`: `-r`, `-n`, `-u`, `-m`, `-s`, `-T`, `-S`

#### Модификация

Добавим в каждый объект поле `date`, содержащее дату события в UTC
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

Внутренний конвейер
-----

При использовании стандартных системных конвейеров (pipes) для взаимодействия между несколькими `jl-`утилитами появляется много накладных расходов на сериалицацию/десериализацию в/из JSON т.к. каждая утилита в отдельности принимает JSON из stdin и отдаёт JSON в stdout.

Для решения этой проблемы все `jl-`утилиты поддерживают внутреннюю реализацию конвейеров, которые позволяют им взаимодействовать между собой в контексте одного процесса без затрат на парсинг. Делается это простой заменой `|`  на `\|` между `jl-`командами в командной строке. Например
```sh
cat /tmp/test.json \
	| jl-filter 'type == "buy"'
	| jl-sum price
```
можно заменить на
```sh
cat /tmp/test.json \
	| jl-filter 'type == "buy"'
	\| jl-sum price
```

Производительность
-----

Потребление CPU всех утилит кроме `jl-sort` - `O(n)`, по памяти `O(1)`.

Сложность `jl-sort` целиком зависит от реализации системного `sort`, дополнительные расходы по CPU также `O(n)`, по памяти `O(1)`.

Использование встроенного механизма конвейеров сильно увеличивает
производительность т.к. парсинг JSON очень затратная операция.
Но есть обратная сторона: все операции в пределах конвейера выполняются в одном
потоке, поэтому при очен длинных конвейерах стоит соблюдать баланс.

Утилиты
-----

#### `jl-sql` - SQL

Принимает один обязательный аргумент - SQL и имеет несколько опций:

- `-T DIR` - временный каталог, в котором будет происходить сортировка,
если она не помещается в буфер сортировки в памяти. По умолчанию берётся `$TMPDIR`
или `/tmp`. Будьте внимательны, когда сортируете большие объёмы, имея раздел `/tmp` на рамдиске - память может закончиться
- `-S BUF` - размер буфера сортировки в памяти, задваётся в байтах. Если буфер переполняется, то
используется ФС (см. опцию `-T`)


#### `jl-sort` - сортировка

Враппер над GNU Sort, позволяющий сортировать JSON. Сохраняет все плюсы обычного `sort`,
такие как поддержка сортировки в ФС, merge-sort, стабильная сортировка, ограничение размера буфера сортировки.

#### `jl-filter` - фильтрация

Аналог `grep`, но для JSON.

#### `jl-reduce` - группировка по ключу и агрегация

Обобщённая утилита, которая умеет производит свёртку элементов в одно значение для каждой группы.
Принимает 3 аргумента обязательных в виде JS-функций:

- `-i FUNC` - инициализатор аккумулятора: вызывается для каждой новой группы.
Функция запускается в контексте группы.
- `-u FUNC` - обновление аккумулятора: функция, вызываемая для каждого элемента группы.
Функция запускается в контексте группы и принимает аргумент `r`, в котором текущий элемент потока
- `-r FUNC` - получение значения аккумулятора: вызывается в конце группы для получения результата
Функция запускается в контексте группы.

и один необазятельный аргумент

- `-k KEYDEF` - ключ, который будет использован для группировки, может быть функций. Для правильной работы
входной поток должен быть отсортирован по этому ключу в любом направлении

Для лучшего понимания, приведу пример простой реализации `jl-sum`, которая считают сумму поля `amount`
для каждого юзера, который идентификируется полем `uid`

```sh
jl-reduce -k uid -i '{this.sum = 0}' -u '{this.sum += r.amount}' -r '{return this.sum}'
```

Для входного потока, содержащего
```json
{"uid": 1, "amount": 10}
{"uid": 1, "amount": 11}
{"uid": 2, "amount": 12}
{"uid": 3, "amount": 13}
```
На выходе получим
```json
{"key":1,"value":21}
{"key":2,"value":12}
{"key":3,"value":13}
```

Если не указывать `-k`, то свёртка будет проходить по всему потоку и на выходе получим одно значение
```json
{"value":46}
```

#### `jl-sum` - суммирование

Предефайн для `jl-reduce`, который считает сумму параметра по группам

#### `jl-count` - подсчёт количества

Предефайн для `jl-reduce`, который считает количество элементов в группе

#### `jl-transform` - модификация
#### `jl-extract` - извлечение значения поля
#### `jl-from-csv` - конвертация CSV в JSON
#### `jl-plainify` - конвертация сложного объекта в одноуровневый k-v
