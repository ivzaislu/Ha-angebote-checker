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
