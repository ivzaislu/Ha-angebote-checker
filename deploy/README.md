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

