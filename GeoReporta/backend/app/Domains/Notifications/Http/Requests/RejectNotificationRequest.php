<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class RejectNotificationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
            'reason' => ['required', 'string', 'min:10', 'max:500'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'reason.required' => __('messages.rejection_reason_required'),
            'reason.min' => __('messages.rejection_reason_min'),
            'reason.max' => __('messages.rejection_reason_max'),
            'reason.string' => __('messages.rejection_reason_string'),
        ];
    }
}
