#!/bin/sh
echo "=== Удаление лишних импортов ==="
docker-compose exec backend sh -c "find app/ -name '*.py' -exec autoflake --in-place --remove-all-unused-imports --remove-duplicate-keys --ignore-init-method {} \;"

echo "=== Сортировка импортов ==="
docker-compose exec backend isort app/

echo "=== Форматирование кода ==="
docker-compose exec backend black app/