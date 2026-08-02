# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Three in-product roles operate the system:

- **Ciudadano**: reports incidents (location, type/subtype, priority, description), tracks their status, comments/follows up.
- **Responsable / Apoyo** (staff): triage and manage assigned incidents, change status, comment, resolve.
- **Administrador**: manages users, roles, permissions, categories, and system-wide configuration.

The people actually judging the product are university evaluators (docentes) reviewing a functional capstone demo — not a live municipal deployment. Design for a demo that reads as credible, real-world municipal software when walked through end-to-end by an evaluator, not for a real citizen audience yet.

## Product Purpose

A web system for managing georeferenced municipal/technical incidents end-to-end: not just registering a report, but tracking it through a full lifecycle — status workflow, responsible-party assignment, threaded comments, notifications, and history — with metrics/visualization over the result. Success = an evaluator can walk the full loop (citizen reports → staff triages/assigns → status changes → resolution) and see it work coherently, backed by real data and visible quality practices (tests, metrics, load testing).

## Positioning

Goes beyond a simple incident-registration form: full traceability (who changed what, when), hierarchical classification (type → subtype), normalized location data, role-based assignment, and real-time notifications — the same shape of substance a real municipal ops tool would need, not a toy CRUD demo.

## Operating Context

- Academic capstone project (Carrera de Software, Facultad de Sistemas y Telecomunicaciones, UPSE) — deliverables include a technical document, DB dump, and a live URL for evaluation.
- Deployed via Docker Swarm on a self-hosted stack (Laravel backend API, static frontend, PostgreSQL/PostGIS, Redis, Mercure/SSE for real-time notifications, Leaflet for maps).
- Frontend is vanilla JS + Vite (no framework) with Leaflet for map/location UI — not Bootstrap-templated as the original README brief states; treat the README's tech table as outdated.
- Grading rubric rewards: multi-instance deployment/scaling, extra container configuration, and optimization beyond minimum requirements — visible engineering polish is part of the evaluation, not just functional coverage.

## Capabilities and Constraints

- Incident CRUD with title, description, location, type/subtype, priority (alta/media/baja), timestamps.
- Status workflow: Pendiente → En proceso → Resuelto, with full change history (user + timestamp).
- Assignment of one or more responsables/apoyo per incident.
- Threaded comments with images per incident.
- Read/unread notifications on status changes.
- Normalized location (país/provincia/ciudad) plus map-based georeferencing.
- Filtered/grouped queries and basic metrics (counts by status/type/location, average resolution time), shown via tables and simple charts/dashboard.
- No formal accessibility standard is required by the coursework; apply reasonable accessibility practice without a WCAG audit obligation.

## Brand Commitments

None. "Sistema de Incidencias Georreferenciadas" is a descriptive working name, not a fixed brand — free to name/design without preserving an existing identity, logo, or palette.

## Evidence on Hand

No real citizen data, testimonials, or case studies exist — this is a simulated municipal environment for academic evaluation. Do not fabricate real-world customers, press, or benchmark claims; sample/demo data should read as plausible incident reports, not marketing proof.

## Product Principles

1. **Traceability over speed**: every state change, assignment, and comment must be attributable and timestamped — the lifecycle history is the product's substance, not a footnote.
2. **Read as real, not academic toy**: the evaluator's impression of credibility matters — data, flows, and edge cases should look like a real ops tool, not a classroom exercise.
3. **Role clarity**: citizen, staff (responsable/apoyo), and admin have distinct jobs and distinct views — never blur what each role can see or do.
4. **Location is structural, not decorative**: georeferencing (map + normalized país/provincia/ciudad) is core to how incidents are found, filtered, and understood — not an optional field.
5. **Visible engineering quality**: tests, metrics, and deployment polish are graded criteria — design and implementation should make that quality legible, not just present.

## Accessibility & Inclusion

No formal standard (e.g. WCAG AA) is required by the coursework. Apply reasonable accessibility practice (contrast, keyboard nav, semantic markup) without a formal audit obligation.
