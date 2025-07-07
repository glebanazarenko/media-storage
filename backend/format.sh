#!/bin/sh
echo "=== Удаление лишних импортов ==="
docker-compose exec backend sh -c "find src/ -name '*.py' -exec autoflake --in-place --remove-all-unused-imports --remove-duplicate-keys --ignore-init-method {} \;"

echo "=== Сортировка импортов ==="
docker-compose exec backend isort src/

echo "=== Форматирование кода ==="
docker-compose exec backend black src/