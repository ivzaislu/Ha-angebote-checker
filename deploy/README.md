# Установка на VPS (Ubuntu/Debian + systemd)

Требования: Linux с systemd, Git, Node.js 22+, npm, доступ к PostgreSQL (например, Neon), права sudo. Скрипт **не** устанавливает Node.js, PostgreSQL, nginx или сертификат TLS.

```bash
git clone -b feature/self-learning-product-catalog https://github.com/ivzaislu/Ha-angebote-checker.git
cd Ha-angebote-checker
sudo bash deploy/install.sh
```

Первый запуск создаст `/etc/angebote-checker.env` с правами 600 и остановится. Впишите в него `DATABASE_URL` (настоящий постоянный PostgreSQL) и при необходимости `PORT=8080`, затем повторите:

```bash
sudoedit /etc/angebote-checker.env
sudo bash deploy/install.sh
sudo systemctl status angebote-checker
```

Сервис слушает `127.0.0.1:8080` по умолчанию. Для доступа из интернета настройте отдельно nginx/Caddy с HTTPS и обратным прокси на этот адрес.

## Обновление

```bash
sudo bash /opt/angebote-checker/deploy/update.sh
sudo journalctl -u angebote-checker -n 100 --no-pager
```

Обновление делает только fast-forward ветки, устанавливает зависимости, собирает приложение, применяет миграции и перезапускает systemd. Локальные незакоммиченные изменения блокируют обновление. База данных **не удаляется**.

**Перед обновлением делайте резервную копию PostgreSQL** (например, `pg_dump`). Миграции могут менять схему, автоматического отката базы нет. Скрипт не гарантирует zero-downtime. Не передавайте `DATABASE_URL` в GitHub или публичные логи.

Пока ветка экспериментальная: полноценный набор тестов и проверка реального VPS не завершены. Для production рекомендуется зафиксировать проверенный commit/tag вместо постоянно движущейся feature-ветки.

## Ubuntu 18.04 / 1 ГБ RAM / 1 vCPU (экспериментально)

**Не используйте** обычные `install.sh` и `update.sh`: они требуют Node.js 22 на хосте и выполняют сборку на VPS. Для старой Ubuntu предусмотрены `legacy-ubuntu-install.sh` и `legacy-ubuntu-update.sh`.

Нужен **уже работающий Docker Engine**, совместимый с ядром сервера (`docker info`). Установка Docker не автоматизирована: Ubuntu 18.04 больше не поддерживается современными стандартными пакетами, а совместимость старых версий Docker с новым образом не подтверждена. Скрипт намеренно не меняет системные репозитории. Образ публикуется в GitHub Container Registry (GHCR); доступ к пакету должен быть открыт публично либо Docker должен быть авторизован через `docker login ghcr.io`.

```bash
git clone -b feature/self-learning-product-catalog https://github.com/ivzaislu/Ha-angebote-checker.git
cd Ha-angebote-checker
sudo bash deploy/legacy-ubuntu-install.sh
# после создания файла:
sudoedit /etc/angebote-checker-container.env
# DATABASE_URL=postgresql://...
sudo chmod 600 /etc/angebote-checker-container.env
sudo bash deploy/legacy-ubuntu-install.sh
```

Обновление: `sudo bash deploy/legacy-ubuntu-update.sh`. Приложение слушает только `127.0.0.1:8080`; HTTPS обеспечивается отдельным reverse proxy. Контейнер ограничен 640 МБ RAM и 1 CPU; для `--memory-swap` нужна поддержка ядра. Используйте внешний PostgreSQL, а не локальную базу в контейнере. **До обновления сделайте резервную копию БД**: миграции не откатываются при возврате к предыдущему контейнеру. Автоматический откат проверяет только запуск процесса, не полноценную работоспособность HTTP/API.

Это пока не проверено на реальном Ubuntu 18.04. Для этого варианта нужен тест на сервере и проверка доступности GHCR-образа.


## Docker Compose (внешний PostgreSQL)

Нужны Docker Engine, **Docker Compose v2 с поддержкой `up --wait`**, доступ к GHCR и постоянный PostgreSQL. Сборка выполняется в GitHub Actions, поэтому Node.js и сборка на VPS не нужны. Локальный PostgreSQL в этот Compose не входит. Ограничения памяти для приложения и мигратора — 640 и 256 МБ соответственно, потребление Docker/ОС учитывайте отдельно.

```bash
git clone -b feature/self-learning-product-catalog https://github.com/ivzaislu/Ha-angebote-checker.git
cd Ha-angebote-checker
cp .env.compose.example .env
chmod 600 .env
# В редакторе задайте DATABASE_URL и APP_IMAGE с SHA проверенного образа.
# Символы пароля в URL должны быть percent-encoded.
docker compose config --quiet
docker compose pull
docker compose up -d --wait --wait-timeout 180
docker compose ps -a
curl --fail http://127.0.0.1:8080/
```

Образ нового коммита доступен только после успешного `Publish VPS image`. Если GHCR требует авторизацию, выполните `docker login ghcr.io` на сервере. Не выводите `docker compose config` без `--quiet` в публичные логи: он содержит URL базы.

Мигратор запускается перед приложением. При ошибке миграции новое приложение не стартует. Проверка HTTP подтверждает ответ страницы; доступность базы и API проверяйте отдельно. Для проверки схемы без вывода реквизитов:

```bash
docker compose exec -T app node --input-type=module -e 'import pg from "pg"; const p=new pg.Pool({connectionString:process.env.DATABASE_URL}); try { const r=await p.query("select to_regclass($1) as archive",["public.offer_archive"]); if(!r.rows[0].archive) process.exitCode=1; else console.log("archive schema OK"); } finally { await p.end(); }'
```

После запуска проверьте поиск по своему индексу, «Историю цен», затем сохранность истории после `docker compose restart app`. Можно отдельно собрать небольшой региональный архив (создаёт реальные записи):

```bash
docker compose exec -T app node --experimental-strip-types scripts/archive-marktguru.ts collect 10115
# Файл создаётся внутри контейнера; заберите его до пересоздания контейнера.
docker compose exec -T app node --experimental-strip-types scripts/archive-marktguru.ts export /tmp/training-candidates.jsonl
docker compose cp app:/tmp/training-candidates.jsonl ./training-candidates.jsonl
```

Сбор зависит от доступности Marktguru. Подробности формата и ограничений — [ARCHIVE.md](../webapp/ARCHIVE.md).

### Обучение кнопкой

После применения миграции `0005_product_training_jobs.sql` кнопка находится в разделе
«Нейросеть товаров». В `.env` задайте `TRAINING_ADMIN_TOKEN` (не менее 24 символов,
например результат `openssl rand -hex 24`) и пересоздайте `app`. Ключ вводится в поле
«Ключ владельца»; браузер не сохраняет его между перезагрузками страницы. Не
публикуйте ключ в логах и переписке. При доступе по обычному HTTP ключ передаётся без
шифрования; для постоянного доступа используйте HTTPS или SSH-туннель.

Один клик запускает отдельный процесс обучения на сервере. Можно закрыть страницу:
задание, его состояние и краткий результат хранятся в PostgreSQL. Повторные нажатия
во время обучения возвращают то же задание. Кнопка не скачивает листовки: она читает
до 10 000 последних немецких снимков архива и до 10 000 проверенных меток, добавляет
авторский учебный набор, обучает и проверяет кандидата тем же механизмом, что CLI.
Кандидат включается только после проверки качества. Отказ сохраняет действующую
модель и показывает причины. Повторное обучение на тех же данных само по себе не
гарантирует улучшения; автоматические метки правил остаются слабой разметкой.

Одновременно работает одно задание из интерфейса. PostgreSQL advisory lock защищает
живой worker от ошибочного восстановления. Если контейнер остановлен, незавершённое
задание после 90 секунд без heartbeat и освобождения блокировки будет помечено как
прерванное при следующей проверке статуса. Повторный запуск — кнопкой, автоматического
расписания нет. Лимит одного запуска — 30 минут. CLI оставлен для оператора; не
запускайте его параллельно с кнопкой. При ошибке смотрите `docker compose logs --tail 80 app`.

### Обновление через Compose

Сначала сохраните текущий SHA образа из `.env` и резервную копию PostgreSQL. Убедитесь, что порт не занят старым контейнером/systemd-сервисом. Останавливать существующее развёртывание следует только после определения того, каким способом оно запущено.

```bash
git pull --ff-only
# Обновите APP_IMAGE в .env на новый проверенный SHA.
docker compose pull
# Явно повторите мигратор: завершившийся контейнер прошлого запуска не должен его пропустить.
docker compose run --rm --no-deps migrate
docker compose up -d --wait --wait-timeout 180 --force-recreate
docker compose ps -a
docker compose logs --tail 80 app
```

При неуспешной HTTP-проверке верните прежний `APP_IMAGE` и пересоздайте приложение. Миграции базы автоматически не откатываются. Команда `docker compose down` удаляет контейнеры этой Compose-конфигурации, но внешнюю PostgreSQL не затрагивает. Не запускайте `down` для другой существующей конфигурации без проверки.
