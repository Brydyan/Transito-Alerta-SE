<?php

declare(strict_types=1);

return [
    'nearby_radius_km' => (float) env('OPERATOR_DASHBOARD_NEARBY_RADIUS_KM', 10),
    'recommendations_limit' => 10,
    'cache_ttl_seconds' => 300,
];
