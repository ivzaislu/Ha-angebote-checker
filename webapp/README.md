# Angebote — standalone app

Ветка `standalone-app`. Интеграция Home Assistant в `custom_components/` не тронута.

Это веб-версия той же идеи: свой список товаров, почтовый индекс, фильтр сетей и проверка текущих проспектов через Marktguru. Логика ранжирования перенесена из `coordinator.py` (точное имя выше, чем «похожее» вроде Feuchtes Toilettenpapier для запроса Toilettenpapier).

Файлы здесь — исходники приложения (список, запрос, карточки акций). Они собираются как веб-приложение, а не как карточка Lovelace.

Ключи Marktguru те же публичные, что уже лежат в `custom_components/angebote_checker/const.py`, и используются только на сервере.
