<?php

declare(strict_types=1);

namespace App\Domains\Invitations\Http\Controllers;

use App\Domains\Invitations\Exceptions\InvitationGoneException;
use App\Domains\Invitations\Exceptions\InvitationNotFoundException;
use App\Domains\Invitations\Http\Requests\InvitationAcceptRequest;
use App\Domains\Invitations\Services\InvitationService;
use Illuminate\Http\JsonResponse;

class InvitationAcceptController
{
    public function __construct(
        private readonly InvitationService $invitationService,
    ) {}

    /**
     * Acepta una invitación de usuario.
     *
     * POST /api/invitations/{token}/accept
     *
     * @throws InvitationNotFoundException 404
     * @throws InvitationGoneException 410
     */
    public function accept(InvitationAcceptRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $this->invitationService->acceptInvitation(
            tokenPlain: $validated['token'],
            password: $validated['password'],
            acceptTerms: (bool) $validated['accept_terms'],
            termsVersion: $validated['terms_version'],
        );

        return response()->json(['message' => __('messages.account_activated')], JsonResponse::HTTP_OK);
    }

    /**
     * Preview de los metadatos de una invitación SIN consumirla.
     *
     * GET /api/invitations/{token}/preview
     *
     * Pensado para que el frontend de /accept-invite muestre org,
     * invitador, rol y expiración ANTES de pedirle al usuario que
     * tipee su contraseña. Read-only: el token queda intacto y puede
     * ser consumido por `accept` luego.
     *
     * Estado HTTP:
     *   200 → payload con org/invitador/role/expiración (token pendiente)
     *   404 → token desconocido (InvitationNotFoundException)
     *   410 → token expirado o ya consumido (InvitationGoneException)
     *
     * @throws InvitationNotFoundException cuando el token no existe (404)
     * @throws InvitationGoneException cuando el token está expirado o consumido (410)
     */
    public function preview(string $token): JsonResponse
    {
        $resource = $this->invitationService->previewInvitation($token);

        return response()->json($resource->resolve());
    }
}
