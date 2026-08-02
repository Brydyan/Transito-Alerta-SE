<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    // Firebase Authentication — server-side service-account credentials
    // for the registration + Google auth feature (PR-2).
    //
    // The binding in AppServiceProvider reads `credentials_path` first;
    // if empty it falls back to env('FIREBASE_CREDENTIALS'). Both
    // resolve to the same value here, so the env var is the source of
    // truth and config merely aliases it.
    //
    // NEVER commit the service-account JSON to git. Place it at a
    // path covered by .gitignore (e.g. backend/storage/...) and point
    // FIREBASE_CREDENTIALS at the absolute path. See backend/.env.example
    // for the full documentation block.
    'firebase' => [
        'credentials_path' => env('FIREBASE_CREDENTIALS'),
        'project_id' => env('FIREBASE_PROJECT_ID'),
        'leeway_seconds' => (int) env('FIREBASE_LEEWAY_SECONDS', 5),
    ],

];
