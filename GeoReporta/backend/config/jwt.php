<?php

return [
    'access_secret' => env('JWT_ACCESS_SECRET'),
    'access_expires_in' => env('JWT_ACCESS_EXPIRES_IN', '15m'),
    'refresh_secret' => env('JWT_REFRESH_SECRET'),
    'refresh_expires_in' => env('JWT_REFRESH_EXPIRES_IN', '7d'),
];
