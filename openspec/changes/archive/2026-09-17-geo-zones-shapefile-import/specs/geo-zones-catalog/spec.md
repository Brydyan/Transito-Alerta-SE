# Delta for Geo-Zones Catalog

## ADDED Requirements

### Requirement: Import Reuses Repository Create

When the import endpoint processes features, `GeoZonesRepository.create()`
MUST be called once per feature within the import transaction. The import
flow MUST NOT bypass repository-level validation (geometry, bounds).

#### Scenario: Repository create called per imported feature

- GIVEN a valid zip with 5 features
- WHEN `POST /geo-zones/import` processes the features
- THEN `GeoZonesRepository.create()` is called exactly 5 times (minus skipped)
- AND each call receives the same DTO shape as a manual `POST /geo-zones` call
