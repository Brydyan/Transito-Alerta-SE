<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

class SecurityHeadersTest extends TestCase
{
    public function test_x_frame_options_header_present(): void
    {
        $response = $this->get('/api/incidents');
        $this->assertTrue($response->headers->has('X-Frame-Options'));
        $this->assertEquals('DENY', $response->headers->get('X-Frame-Options'));
    }

    public function test_x_content_type_options_header_present(): void
    {
        $response = $this->get('/api/incidents');
        $this->assertTrue($response->headers->has('X-Content-Type-Options'));
        $this->assertEquals('nosniff', $response->headers->get('X-Content-Type-Options'));
    }

    public function test_strict_transport_security_header_present(): void
    {
        $response = $this->get('/api/incidents');
        $this->assertTrue($response->headers->has('Strict-Transport-Security'));
        $this->assertStringContainsString('max-age=31536000', $response->headers->get('Strict-Transport-Security'));
    }

    public function test_content_security_policy_header_present(): void
    {
        $response = $this->get('/api/incidents');
        $this->assertTrue($response->headers->has('Content-Security-Policy'));
        $this->assertStringContainsString("default-src 'self'", $response->headers->get('Content-Security-Policy'));
    }

    public function test_referrer_policy_header_present(): void
    {
        $response = $this->get('/api/incidents');
        $this->assertTrue($response->headers->has('Referrer-Policy'));
        $this->assertEquals('strict-origin-when-cross-origin', $response->headers->get('Referrer-Policy'));
    }

    public function test_permissions_policy_header_present(): void
    {
        $response = $this->get('/api/incidents');
        $this->assertTrue($response->headers->has('Permissions-Policy'));
    }

    public function test_all_endpoints_have_security_headers(): void
    {
        $endpoints = [
            '/api/incidents',
            '/api/incidents/stats',
        ];

        foreach ($endpoints as $endpoint) {
            $response = $this->get($endpoint);
            $this->assertTrue(
                $response->headers->has('X-Frame-Options'),
                "Missing X-Frame-Options on {$endpoint}"
            );
            $this->assertTrue(
                $response->headers->has('X-Content-Type-Options'),
                "Missing X-Content-Type-Options on {$endpoint}"
            );
            $this->assertTrue(
                $response->headers->has('Strict-Transport-Security'),
                "Missing Strict-Transport-Security on {$endpoint}"
            );
            $this->assertTrue(
                $response->headers->has('Content-Security-Policy'),
                "Missing Content-Security-Policy on {$endpoint}"
            );
        }
    }
}
