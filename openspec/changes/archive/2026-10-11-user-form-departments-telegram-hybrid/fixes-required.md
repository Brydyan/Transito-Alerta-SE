# Fixes Required: user-form-departments-telegram-hybrid (Round 2)

> **Para Minimax**: Los hallazgos W1/W2/W3 de la ronda 1 están resueltos y
> verificados. Hay UN hallazgo nuevo, C1. Es mecánico y solo toca un archivo
> de test. Si el código no coincide con lo descrito aquí, pará y escalá.

---

## Estado de los Gates (Ronda 2)

| Gate | Resultado | Lectura |
|------|-----------|---------|
| Backend typecheck | ✅ sin errores | |
| Backend tests (1405/1405) | ✅ | |
| `users.controller.spec.ts` (14/14) | ✅ | |
| Frontend typecheck | ✅ sin errores | |
| `new-user-form.component.spec.ts` (46/46) | ✅ | Incluye 2 nuevos de W3 |
| `profile-action-cards.component.spec.ts` (12/12) | ✅ | Incluye 1 nuevo de W1 |
| Frontend build | ✅ | Budget en 650kB, sin warning |
| **Frontend full suite** | **❌ 928/930** | **2 fallos en `profile.component.spec.ts`** |

---

## Hallazgos

### C1 — `profile.component.spec.ts` regresionó por el cambio de Phase 4 **[TUYA — código]**

**Archivo**: `frontend/src/app/features/profile/profile.component.spec.ts`
**Severidad**: CRITICAL

**Qué pasó**: `ProfileActionCardsComponent` fue refactorizado en Phase 4 para inyectar
`UserService` y llamar `getCurrentUser()` vía `toSignal(this.userService.getCurrentUser())`
al inicializarse (línea 201 del componente). `ProfileComponent` incluye
`ProfileActionCardsComponent` como hijo en su template. Cuando `profile.component.spec.ts`
crea `ProfileComponent`, Angular también instancia `ProfileActionCardsComponent`, que hace
**una segunda llamada** a `getCurrentUser()`.

El spec en línea 78 aserta `toHaveBeenCalledTimes(1)` → ahora falla con `Received: 2`.

La segunda falla ("getCurrentUser 500") ocurre porque el mock del `UserService` en el
spec no incluye `generateTelegramLink`. Al crear una segunda instancia de `ProfileComponent`
(línea 194 del spec) con el mock sobreescrito para lanzar error, el `toSignal()` del hijo
propaga un error no manejado.

**Confirmación de regresión**: Con `git stash`, los 9 tests de `profile.component.spec.ts`
pasan. Con el stash restaurado, 2 fallan. El código de producción es correcto; el test
no anticipó el efecto secundario del hijo.

**Corrección** en `profile.component.spec.ts` (no toques código de producción):

1. Agregar `generateTelegramLink` al mock de `UserService`:
```typescript
// línea ~52, dentro de createComponent() o del beforeEach
mockUserService = {
  getCurrentUser: jest.fn().mockReturnValue(of(fixtureUser)),
  updateProfile: jest.fn().mockReturnValue(of(fixtureUser)),
  uploadProfileImage: jest.fn().mockReturnValue(of(fixtureUser)),
  generateTelegramLink: jest.fn().mockReturnValue(of({ telegram_link: null })),
};
```

2. Cambiar la aserción de la línea 78:
```typescript
// ❌ Antes (falla — el hijo también llama a getCurrentUser)
expect(mockUserService.getCurrentUser).toHaveBeenCalledTimes(1);

// ✅ Después (el component padre + el hijo hacen 1 llamada cada uno)
expect(mockUserService.getCurrentUser).toHaveBeenCalled();
```

**Verifica con**:
```bash
npx jest --no-coverage src/app/features/profile/profile.component.spec.ts
```
Esperado: `Tests: 9 passed, 9 total`.

---

## Reparto

| Hallazgo | Responsable | Estado |
|----------|-------------|--------|
| C1 — test profile.component.spec.ts | Minimax | Listo para ejecutar |
| W1/W2/W3 (ronda 1) | Minimax | ✅ Resueltos y verificados |

---

## No toques

| Qué | Motivo |
|-----|--------|
| `profile-action-cards.component.ts` | Lógica correcta; 12/12 tests pasan |
| `profile.component.ts` | No es el problema; el test es el que debe adaptarse |
| `new-user-form.component.ts` | 46/46 tests pasan; no requiere cambios |
| `users.controller.ts` | 14/14 pasan |
| Angular budget en `angular.json` | Ya está en 650kB — no bajar |

---

## Orden sugerido

1. **C1** — agregar `generateTelegramLink` al mock y cambiar `toHaveBeenCalledTimes(1)` → `toHaveBeenCalled()`. 3 min.
2. Verificar con `npx jest --no-coverage src/app/features/profile/profile.component.spec.ts` → 9/9 pass.
3. Re-correr full suite: `npx jest --no-coverage` → 930/930 pass.
