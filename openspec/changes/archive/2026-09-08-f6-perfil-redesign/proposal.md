# Proposal: F6 Perfil Redesign

**Change**: `2026-09-08-f6-perfil-redesign`  
**Scope**: Frontend UI redesign  
**Date**: 2026-09-08  

## What
Redesign user profile page with personal information form (name, email, phone, profile photo) + action cards (password, zone preference, support).

## Why
- F6 spec requirement (mock 10-01)
- Centralize user profile management

## Scope
- Personal info form (reactive)
- Photo upload component
- Privacy notice
- 3 action cards (password, zone, support)
- Form validation (required fields, phone format)
- Out: Change password, zone preference (future phases)

## Definition of Done
- [ ] Form renders with all fields
- [ ] Photo upload works
- [ ] Save button submits form
- [ ] Validation works (name required, phone format)
- [ ] `pnpm test` passes
- [ ] E2E suite green
