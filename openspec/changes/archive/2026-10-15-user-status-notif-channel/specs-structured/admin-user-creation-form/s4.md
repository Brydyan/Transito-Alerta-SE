# Delta for admin-user-creation-form — S4: New-User-Form Label Rename

## MODIFIED Requirements

### Requirement: Initial Status and Notification Channel (FIXED)

The new-user form MUST render the account status section with the label
"Cuenta" (previously "Estado inicial"). The select inside this section MUST
remain disabled and display the fixed value "Activo". No behavioral change
is introduced by this rename.

(Previously: The section label read "Estado inicial".)

#### Scenario: Admin opens new user form — label reads "Cuenta"

- GIVEN a user with any admin-capable role navigates to `/app/admin/usuarios/new`
- WHEN the form finishes rendering
- THEN the account status section label reads "Cuenta"
- AND the label "Estado inicial" is NOT present anywhere in the form

#### Scenario: Account status select remains disabled and shows Activo

- GIVEN the new-user form is fully loaded
- WHEN the admin observes the account status select inside the "Cuenta" section
- THEN the select displays "Activo" as its value
- AND the select is disabled (not interactive)
- AND no other values are selectable

#### Scenario: Canal fijo en Correo Electrónico (unchanged)

- GIVEN the new-user form is fully loaded
- WHEN the admin observes the "Canal de notificaciones preferido" dropdown
- THEN it displays "Correo Electrónico" as its value
- AND the dropdown is disabled
