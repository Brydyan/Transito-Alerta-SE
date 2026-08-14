# Requirements: Complete Backend Test Files under 50% Coverage

## 1. Description
Identificar y completar las pruebas unitarias o de integración para todos los archivos del backend en la ruta `backend/api/app` que tengan menos del 50% de cobertura actual. El objetivo es elevar la cobertura de cada uno de ellos por encima del 80%.

## 2. Requirements (EARS)
- **R1:** While executing the test suite, the system MUST report at least 80% coverage for the identified files.
- **R2:** Where a function has excessive lines or branches (high complexity), the system MUST be refactored into smaller sub-functions (divide and conquer) to avoid debt and code smells.
- **R3:** Where lines are unreachable or highly specific, the system MUST be tested using specific unit tests to cover those lines.
