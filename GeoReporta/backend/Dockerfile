FROM php:8.4-cli-alpine

ADD https://github.com/mlocati/docker-php-extension-installer/releases/latest/download/install-php-extensions /usr/local/bin/
RUN chmod +x /usr/local/bin/install-php-extensions

RUN apk add --no-cache bash

# Laravel logs → stderr for docker logs visibility
ENV LOG_CHANNEL=stderr

RUN install-php-extensions pdo_pgsql zip mbstring bcmath sockets pcntl redis sodium pcov gd swoole

# Raise upload limits for avatar uploads.
# MUST stay in sync with App\Domains\Users\Models\User::AVATAR_MAX_KB (800 KB).
# upload_max_filesize must be >= User::AVATAR_MAX_KB
# post_max_size       must be >= User::AVATAR_MAX_KB + form overhead (~1 MB)
# Without these, PHP rejects any multipart upload above the default 2 MB before
# Laravel can validate it, causing 422s with misleading "validation failed" errors.
RUN { \
        echo 'upload_max_filesize = 1M'; \
        echo 'post_max_size = 2M'; \
        echo 'memory_limit = 128M'; \
    } > /usr/local/etc/php/conf.d/uploads.ini

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/backend

COPY composer.json composer.lock ./
RUN composer install --no-dev --optimize-autoloader --no-scripts

COPY . .
RUN composer dump-autoload --optimize

RUN mkdir -p storage/logs storage/framework/cache storage/framework/sessions storage/framework/views bootstrap/cache \
    && chmod -R 775 storage bootstrap/cache

COPY entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
