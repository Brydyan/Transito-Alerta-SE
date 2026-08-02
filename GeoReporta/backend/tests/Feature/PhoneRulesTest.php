<?php

use App\Support\PhoneRules;

test('validates ecuadorian phone numbers correctly', function () {
    // Valid formats
    expect(preg_match(PhoneRules::REGEX, '0991234567'))->toBe(1); // Mobile 10 digits
    expect(preg_match(PhoneRules::REGEX, '+593991234567'))->toBe(1); // Mobile with +593 (12 digits excluding +)
    expect(preg_match(PhoneRules::REGEX, '022123456'))->toBe(1); // Landline 9 digits
    expect(preg_match(PhoneRules::REGEX, '+59322123456'))->toBe(1); // Landline with +593 (11 digits excluding +)

    // Invalid formats
    expect(preg_match(PhoneRules::REGEX, '12345'))->toBe(0);
    expect(preg_match(PhoneRules::REGEX, '09912345678'))->toBe(0); // Too long (11 digits)
    expect(preg_match(PhoneRules::REGEX, '+59399123456789'))->toBe(0); // Too long
    expect(preg_match(PhoneRules::REGEX, 'abcdefghij'))->toBe(0);
});

test('normalizes ecuadorian phone numbers with +593 prefix', function () {
    expect(PhoneRules::normalize('0991234567'))->toBe('+593991234567');
    expect(PhoneRules::normalize('+593991234567'))->toBe('+593991234567');
    expect(PhoneRules::normalize('593991234567'))->toBe('+593991234567');
    expect(PhoneRules::normalize('022123456'))->toBe('+59322123456');
    expect(PhoneRules::normalize(null))->toBeNull();
    expect(PhoneRules::normalize('   '))->toBeNull();
});
